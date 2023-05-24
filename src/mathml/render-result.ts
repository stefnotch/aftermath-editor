import { hasSyntaxNodeChildren } from "../core";
import { Offset } from "../math-layout/math-layout-offset";
import { RowIndices } from "../math-layout/math-layout-zipper";
import { RenderResult, RenderedElement, RowIndicesAndOffset, RowIndicesAndRange } from "../rendering/render-result";
import { RenderedSelection } from "../rendering/rendered-selection";
import { ViewportCoordinate, ViewportMath } from "../rendering/viewport-coordinate";
import { assert } from "../utils/assert";

export class MathMLRenderResult implements RenderResult<MathMLElement> {
  private readonly rootElement: RenderedElement<MathMLElement>;
  constructor(rootElement: RenderedElement<MathMLElement>) {
    this.rootElement = rootElement;
  }
  getViewportSelection(selection: RowIndicesAndRange): RenderedSelection[] {
    const row = this.getElement(selection.indices);

    // Copium option that only works because we don't have any line breaks in MathML Core.
    // Since we don't have line breaks, we can get the baseline from the first character.
    // Depending on how line breaks are implemented, we might be able to do "line top + (baseline - first line top)"
    const baseline = row.getCaretPosition(0).y;

    function getContentBounds(element: RenderedElement<MathMLElement>): RenderedSelection[] {
      // Make sure to deal with the zero width selection case
      // Selection has offsets, the syntax tree has indices TODO: deal with that

      const isDisjoint =
        BigInt(selection.end) < element.syntaxTree.range.start ||
        (BigInt(selection.end) === element.syntaxTree.range.start && selection.start < selection.end) ||
        element.syntaxTree.range.end < BigInt(selection.start) ||
        (element.syntaxTree.range.end === BigInt(selection.start) && selection.start < selection.end);
      if (isDisjoint) {
        return [];
      }
      const isFullyContained =
        BigInt(selection.start) <= element.syntaxTree.range.start && element.syntaxTree.range.end <= BigInt(selection.end);
      const isIntersecting = !isDisjoint && !isFullyContained;
      const children = element.getChildren();
      if (isIntersecting && children.length > 0) {
        return children.flatMap((v) => getContentBounds(v));
      }

      const contentBounds = element.getContentBounds();
      return contentBounds.map((v) => new RenderedSelection(v, baseline));
    }

    return RenderedSelection.joinAdjacent(getContentBounds(row));
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
      assert(rowChildElement, `Couldn't find row ${indexOfRow} in ${childElement.syntaxTree.name}`);
      element = rowChildElement;
    }
    return element;
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

    let roots = [{ renderedElement: this.rootElement, rowIndices: [] as RowIndices }];
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
      const { renderedElement, rowIndices } = root;

      // Ignore worse distances
      if (ViewportMath.distanceToRectangle(renderedElement.getBounds(), position) > closest.distance) {
        continue;
      }

      // Check all potential positions in this row
      const potential = getClosestPositionInRow(renderedElement, position);
      if (potential === null) {
        continue;
      }

      const newClosest = {
        indicesAndOffset: {
          indices: rowIndices,
          offset: potential.offset,
        },
        distance: ViewportMath.distanceToPoint(position, potential.position),
      };

      if (newClosest.distance < closest.distance) {
        closest = newClosest;
      }

      // Go down the tree, and check all children that are on a new row
      // Note: This could be kinda inefficient for large tables, but that's a problem for another day
      getNewRowsChildren(renderedElement).forEach((v) => {
        assert(v.rowIndex !== null);
        roots.push({ renderedElement: v, rowIndices: rowIndices.concat([v.rowIndex]) });
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

      for (let i = Number(element.syntaxTree.range.start); i <= Number(element.syntaxTree.range.end); i++) {
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
 * @param indexOfContainer The offset in the input tree row.
 * @returns The deepest child element that contains the given index.
 */
function getChildWithContainerIndex(
  element: RenderedElement<MathMLElement>,
  indexOfContainer: Offset
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
