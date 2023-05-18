import { SyntaxNode } from "../../core";
import { Offset } from "../../math-layout/math-layout-offset";
import { RowIndex } from "../../math-layout/math-layout-zipper";
import { RenderedElement, RenderedPosition } from "../../rendering/render-result";
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
  getBounds() {
    return this.element.getBounds();
  }
  getViewportPosition(offset: Offset): RenderedPosition {
    assert(offset === 0, "NothingMathMLElement only supports offset 0");
    // The baseline isn't exposed as a property, so we have this workaround https://github.com/w3c/mathml-core/issues/38
    // https://jsfiddle.net/se6n81rg/1/
    const baseline = this.baselineReaderElement.getBoundingClientRect().bottom;
    const caretSize = this.element.getFontSize();

    const boundingBox = this.element.element.getBoundingClientRect();

    return {
      position: {
        x: (boundingBox.left + boundingBox.right) / 2,
        y: baseline,
      },
      height: caretSize * 0.8,
      depth: caretSize * 0.2,
    };
  }
  getElements() {
    return this.element.getElements();
  }
  getChildren() {
    return this.element.getChildren();
  }
}
