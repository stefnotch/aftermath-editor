import { ParseResult } from "../../core";
import { MathLayoutPosition } from "../../math-layout/math-layout-position";
import { RowIndices, getRowIndices } from "../../math-layout/math-layout-zipper";
import { RenderResult, RenderedElement, RenderedPosition } from "../../rendering/render-result";
import { ViewportCoordinate } from "../../rendering/viewport-coordinate";

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
    }
    // this.rootElement.syntaxTree.range
    throw new Error("Method not implemented.");
  }

  getLayoutPosition(position: ViewportCoordinate): MathLayoutPosition {
    throw new Error("Method not implemented.");
  }
}
