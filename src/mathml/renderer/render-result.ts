import { ParseResult } from "../../core";
import { Offset } from "../../math-layout/math-layout-offset";
import { MathLayoutPosition } from "../../math-layout/math-layout-position";
import { RowIndices, getRowIndices } from "../../math-layout/math-layout-zipper";
import { RenderResult, RenderedElement, RenderedPosition } from "../../rendering/render-result";
import { ViewportCoordinate } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";

export class MathMLRenderResult implements RenderResult<MathMLElement> {
  private readonly rootElement: RenderedElement<MathMLElement>;
  private readonly parsed: ParseResult;
  constructor(rootElement: RenderedElement<MathMLElement>, parsed: ParseResult) {
    this.rootElement = rootElement;
    this.parsed = parsed;
  }
  getViewportPosition(layoutPosition: MathLayoutPosition): RenderedPosition {
    const indices = getRowIndices(layoutPosition.zipper);
    return this.getElement(indices).getViewportPosition(layoutPosition.offset);
  }

  getElement(indices: RowIndices): RenderedElement<MathMLElement> {
    let element = this.rootElement;

    for (let rowIndex of indices) {
      let [indexOfContainer, indexOfRow] = rowIndex;
      assert(element.syntaxTree.range.start <= indexOfContainer && indexOfContainer < element.syntaxTree.range.end);

      const childElement = getChildElementWithIndex(element, indexOfContainer);
      const rowChildElement = childElement.getChildren().find((c) => c.syntaxTree.row_index?.[1] === BigInt(indexOfRow));
      assert(rowChildElement, `Couldn't find row ${indexOfRow} in ${childElement.syntaxTree.name}`);
      element = rowChildElement;
    }
    return element;
  }

  getLayoutPosition(position: ViewportCoordinate): MathLayoutPosition {
    throw new Error("Method not implemented.");
  }
}

/**
 *
 * @param element A rendered element
 * @param indexOfContainer The offset in the input tree row.
 * @returns The deepest child element that contains the given index.
 */
function getChildElementWithIndex(
  element: RenderedElement<MathMLElement>,
  indexOfContainer: Offset
): RenderedElement<MathMLElement> {
  for (let childElement of element.getChildren()) {
    // If we find a better matching child, we go deeper
    if (childElement.syntaxTree.range.start <= indexOfContainer && indexOfContainer < childElement.syntaxTree.range.end) {
      return getChildElementWithIndex(childElement, indexOfContainer);
    }
  }

  // Giving up, returning the current element
  return element;
}
