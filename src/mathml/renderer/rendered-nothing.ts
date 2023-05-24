import { SyntaxNode } from "../../core";
import { Offset } from "../../math-layout/math-layout-offset";
import { RowIndex } from "../../math-layout/math-layout-zipper";
import { RenderedElement } from "../../rendering/render-result";
import { ViewportCoordinate } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { RenderedMathML, createMathElement, createPlaceholder } from "./rendered-element";

export class NothingMathMLElement implements RenderedElement<MathMLElement> {
  element: RenderedMathML;
  private baselineReaderElement: MathMLElement;

  constructor(public syntaxTree: SyntaxNode, public rowIndex: RowIndex | null) {
    this.baselineReaderElement = createMathElement("mphantom", []);
    if ("Leaves" in syntaxTree.children) {
      assert(syntaxTree.children.Leaves.length === 0);
    } else {
      assert("Containers" in syntaxTree.children);
      assert(syntaxTree.children.Containers.length === 0);
    }

    this.element = new RenderedMathML(createMathElement("mrow", [this.baselineReaderElement, createPlaceholder()]));
  }
  getCaretSize(): number {
    return this.element.getCaretSize();
  }
  getBounds() {
    return this.element.getBounds();
  }
  getCaretPosition(offset: Offset): ViewportCoordinate {
    assert(offset === 0, "NothingMathMLElement only supports offset 0");
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
