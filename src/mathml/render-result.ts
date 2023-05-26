import { hasSyntaxNodeChildren, joinNodeIdentifier } from "../core";
import { Offset } from "../input-tree/math-layout-offset";
import { RowIndices, addRowIndex } from "../input-tree/math-layout-zipper";
import { RenderResult, RenderedElement, RowIndicesAndOffset, RowIndicesAndRange } from "../rendering/render-result";
import { RenderedSelection } from "../rendering/rendered-selection";
import { ViewportCoordinate, ViewportMath, ViewportValue } from "../rendering/viewport-coordinate";
import { assert } from "../utils/assert";

type ElementWithIndices = {
  readonly element: RenderedElement<MathMLElement>;
  readonly indices: RowIndices;
};

export class MathMLRenderResult implements RenderResult<MathMLElement> {
  private readonly rootElement: RenderedElement<MathMLElement>;
  constructor(rootElement: RenderedElement<MathMLElement>) {
    this.rootElement = rootElement;
  }
  getViewportSelection(selection: RowIndicesAndRange): RenderedSelection {
    const row = this.getElement(selection.indices);

    // Copium option that only works because we don't have any line breaks in MathML Core.
    // Since we don't have line breaks, we can get the baseline from the first character.
    // Depending on how line breaks are implemented, we might be able to do "line top + (baseline - first line top)"
    const baseline = row.getCaretPosition(0).y;

    const start = row.getCaretPosition(selection.start);
    const end = row.getCaretPosition(selection.end);

    const emptyHeight = {
      top: Infinity,
      bottom: -Infinity,
    };

    function getSelectionHeight(element: RenderedElement<MathMLElement>): { top: ViewportValue; bottom: ViewportValue } {
      // Assumes that the selection is not zero width.
      const isDisjoint = selection.end <= element.syntaxTree.range.start || element.syntaxTree.range.end <= selection.start;
      if (isDisjoint) {
        return emptyHeight;
      }
      const isFullyContained =
        selection.start <= element.syntaxTree.range.start && element.syntaxTree.range.end <= selection.end;
      // If it's just intersecting, try going deeper.
      const isIntersecting = !isDisjoint && !isFullyContained;
      const children = element.getChildren();
      if (isIntersecting && children.length > 0) {
        return children
          .map((v) => getSelectionHeight(v))
          .reduce(
            (a, b) => ({
              top: Math.min(a.top, b.top),
              bottom: Math.max(a.bottom, b.bottom),
            }),
            emptyHeight
          );
      }

      const elementBounds = element.getBounds();
      return {
        top: elementBounds.y,
        bottom: elementBounds.y + elementBounds.height,
      };
    }
    // y and height depend on what is inside the selection.
    const contentHeight = selection.start != selection.end ? getSelectionHeight(row) : { top: start.y, bottom: start.y };
    return new RenderedSelection(
      {
        x: start.x,
        y: contentHeight.top,
        width: end.x - start.x,
        height: contentHeight.bottom - contentHeight.top,
      },
      baseline
    );
  }
  getViewportRowSelection(row: RowIndices) {
    return this.getElement(row).getBounds();
  }
  getViewportCaretSize(row: RowIndices): number {
    return this.getElement(row).getCaretSize();
  }

  getElement(indices: RowIndices): RenderedElement<MathMLElement> {
    let element = this.rootElement;

    for (let rowIndex of indices) {
      let [indexOfContainer, indexOfRow] = rowIndex;
      assert(element.syntaxTree.range.start <= indexOfContainer && indexOfContainer < element.syntaxTree.range.end);

      const childElement = getChildWithContainerIndex(element, indexOfContainer);
      const rowChildElement = childElement.getChildren().find((c) => c.rowIndex?.[1] === indexOfRow);
      assert(rowChildElement, `Couldn't find row ${indexOfRow} in ${joinNodeIdentifier(childElement.syntaxTree.name)}`);
      element = rowChildElement;
    }
    return element;
  }

  /**
   * Get the closest element to the given position.
   */
  getLayoutElement(position: ViewportCoordinate): ElementWithIndices {
    function getLayoutElementContaining(
      element: RenderedElement<MathMLElement>,
      indices: RowIndices
    ): ElementWithIndices | null {
      if (ViewportMath.distanceToRectangle(position, element.getBounds()) > 0) {
        return null;
      } else {
        for (const child of element.getChildren()) {
          const v = getLayoutElementContaining(child, addRowIndex(indices, child.rowIndex));
          if (v) {
            return v;
          }
        }
        return { element, indices };
      }
    }

    return (
      getLayoutElementContaining(this.rootElement, []) ?? {
        element: this.rootElement,
        indices: [],
      }
    );
  }

  getLayoutPosition(position: ViewportCoordinate): RowIndicesAndOffset {
    // Algorithm idea:
    // We start at the top of a row
    // Then we look at every possible caret position in that row,
    //   and how close it is to the position we're looking for.
    // (We can't do binary search, because of equation wrapping)
    // With that, we have a guess for the closest caret position.
    // Then we go down the tree, (to the next one that has a syntaxTree.row_index)
    //   and check their bounding boxes (optimisation)
    //   and then repeat the slow "check every possible caret position in that row".

    const startingElement = this.getLayoutElement(position);

    let roots: ElementWithIndices[] = [startingElement];
    let closest: Readonly<{
      indicesAndOffset: RowIndicesAndOffset | null;
      distance: number;
    }> = {
      indicesAndOffset: null,
      distance: Infinity,
    };

    while (roots.length > 0) {
      const root = roots.pop();
      assert(root !== undefined);
      const { element, indices } = root;

      // Ignore worse distances
      if (ViewportMath.distanceToRectangle(position, element.getBounds()) > closest.distance) {
        continue;
      }

      // Check all potential positions in this row
      const potential = getClosestPositionInRow(element, position);
      if (potential === null) {
        continue;
      }

      const newClosest = {
        indicesAndOffset: {
          indices: indices,
          offset: potential.offset,
        },
        distance: ViewportMath.distanceToPoint(position, potential.position),
      };

      if (newClosest.distance < closest.distance) {
        closest = newClosest;
      }

      // Go down the tree, and check all children that are on a new row
      // Note: This could be kinda inefficient for large tables, but that's a problem for another day
      getNewRowsChildren(element).forEach((v) => {
        assert(v.rowIndex !== null);
        roots.push({ element: v, indices: addRowIndex(indices, v.rowIndex) });
      });
    }

    // Helper functions
    function getClosestPositionInRow(
      element: RenderedElement<MathMLElement>,
      position: ViewportCoordinate
    ): { position: ViewportCoordinate; offset: Offset } | null {
      let closest: Readonly<{
        renderedPosition: { position: ViewportCoordinate; offset: Offset } | null;
        distance: number;
      }> = {
        renderedPosition: null,
        distance: Infinity,
      };

      for (let i = element.syntaxTree.range.start; i <= element.syntaxTree.range.end; i++) {
        const renderedPosition = element.getCaretPosition(i);
        const distance = ViewportMath.distanceToPoint(position, renderedPosition);

        if (distance < closest.distance) {
          closest = {
            renderedPosition: { position: renderedPosition, offset: i },
            distance,
          };
        }
      }

      return closest.renderedPosition;
    }

    /**
     * Go down the tree, and collect all children that start a new row
     */
    function getNewRowsChildren(element: RenderedElement<MathMLElement>): RenderedElement<MathMLElement>[] {
      // We could also write this as a one-liner using a Y-combinator
      return element.getChildren().flatMap((c) => (c.rowIndex ? c : getNewRowsChildren(c)));
    }

    assert(closest.indicesAndOffset !== null);
    return closest.indicesAndOffset;
  }
}

/**
 *
 * @param element A rendered element
 * @param indexOfContainer The index in the input tree row.
 * @returns The deepest child element that contains the given index.
 */
function getChildWithContainerIndex(
  element: RenderedElement<MathMLElement>,
  indexOfContainer: number
): RenderedElement<MathMLElement> {
  // Only walk down if we're still on the same row
  if (hasSyntaxNodeChildren(element.syntaxTree, "Containers")) {
    for (let childElement of element.getChildren()) {
      // If we find a better matching child, we go deeper. Notice how the end bound, aka length, is exclusive.
      if (childElement.syntaxTree.range.start <= indexOfContainer && indexOfContainer < childElement.syntaxTree.range.end) {
        return getChildWithContainerIndex(childElement, indexOfContainer);
      }
    }
  }

  // Giving up, returning the current element
  return element;
}
