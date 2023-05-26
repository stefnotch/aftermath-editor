import { SyntaxNode } from "../../core";
import { Offset } from "../../input-tree/math-layout-offset";
import { RowIndex } from "../../input-tree/math-layout-zipper";
import { RenderedElement } from "../../rendering/render-result";
import { ViewportCoordinate } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { RenderedMathML, createMathElement, createPlaceholder } from "./rendered-element";

export class NothingMathMLElement implements RenderedElement<MathMLElement> {
  element: RenderedMathML;
  private baselineReaderElement: MathMLElement;

  constructor(public syntaxTree: SyntaxNode<"Containers">, public rowIndex: RowIndex | null) {
    this.baselineReaderElement = createMathElement("mphantom", []);
    assert(syntaxTree.children.Containers.length === 0);
    assert(syntaxTree.range.start === syntaxTree.range.end);

    this.element = new RenderedMathML(createMathElement("mrow", [this.baselineReaderElement, createPlaceholder()]));
  }
  getCaretSize(): number {
    return this.element.getCaretSize();
  }
  getBounds() {
    return this.element.getBounds();
  }
  getCaretPosition(offset: Offset): ViewportCoordinate {
    assert(offset === this.syntaxTree.range.start);
    // The baseline isn't exposed as a property, so we have this workaround https://github.com/w3c/mathml-core/issues/38
    // https://jsfiddle.net/se6n81rg/1/
    const baseline = this.baselineReaderElement.getBoundingClientRect().bottom;

    const boundingBox = this.element.element.getBoundingClientRect();
    const x = (boundingBox.left + boundingBox.right) / 2;
    return { x: x, y: baseline };
  }
  getElements() {
    return this.element.getElements();
  }
  getChildren() {
    return this.element.getChildren();
  }
}
