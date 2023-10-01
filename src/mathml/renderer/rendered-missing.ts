import type { SyntaxNodeWith } from "../../core";
import type { Offset } from "../../input-tree/input-offset";
import type { RowIndex } from "../../input-tree/row-indices";
import type { RenderedElement } from "../../rendering/render-result";
import type { ViewportCoordinate } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { RenderedMathML, createMathElement } from "./rendered-element";

export class MissingMathMLElement implements RenderedElement<MathMLElement> {
  element: RenderedMathML;

  constructor(public syntaxTree: SyntaxNodeWith<"Children">, public rowIndex: RowIndex | null) {
    assert(syntaxTree.children.Children.length === 0);
    assert(syntaxTree.range.start === syntaxTree.range.end);

    // TODO: maybe wrap in an merror
    this.element = new RenderedMathML(createMathElement("mi", [document.createTextNode("\xA0\xA0")]));
    this.element.element.classList.add("red-squiggly");
    // this.element.element.setAttribute("title", "Missing element");
  }
  getCaretSize(): number {
    return this.element.getCaretSize();
  }
  getBounds() {
    return this.element.getBounds();
  }
  getCaretPosition(offset: Offset): ViewportCoordinate {
    assert(offset === this.syntaxTree.range.start);
    const boundingBox = this.element.element.getBoundingClientRect();
    const x = (boundingBox.left + boundingBox.right) / 2;
    const baseline = boundingBox.bottom;
    return { x: x, y: baseline };
  }
  getElements() {
    return this.element.getElements();
  }
  getChildren() {
    return this.element.getChildren();
  }
}
