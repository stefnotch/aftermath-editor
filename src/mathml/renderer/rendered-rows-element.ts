import { SyntaxNode, fromCoreRowIndex } from "../../core";
import { RowIndex } from "../../math-layout/math-layout-zipper";
import { RenderedElement, RenderedPosition, Renderer } from "../../rendering/render-result";
import { ViewportRect } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { MathMLTags } from "../mathml-spec";
import { RenderedMathML, createMathElement } from "./rendered-element";

export class RowsContainerMathMLElement implements RenderedElement<MathMLElement> {
  element: RenderedMathML;
  startBaselineReader: MathMLElement;
  endBaselineReader: MathMLElement;

  constructor(
    public syntaxTree: SyntaxNode<"NewRows">,
    public rowIndex: RowIndex | null,
    elementName: MathMLTags,
    renderer: Renderer<MathMLElement>
  ) {
    assert(syntaxTree.children.NewRows.length > 0, "Needs at least one child");
    this.element = new RenderedMathML(createMathElement(elementName, []));
    this.startBaselineReader = createMathElement("mphantom", []);
    this.endBaselineReader = createMathElement("mphantom", []);

    this.element.setChildren(
      syntaxTree.children.NewRows.map(([coreRowIndex, c]) => renderer.render(c, fromCoreRowIndex(coreRowIndex)))
    );
    assert(this.element.getChildren().length === this.syntaxTree.children.NewRows.length, "Invalid number of children");
    assert(this.element.getChildren().length > 0, "Needs at least one rendered child");
  }

  getBounds(): ViewportRect {
    return this.element.getBounds();
  }

  getViewportPosition(offset: number): RenderedPosition {
    assert(this.syntaxTree.range.start <= offset && offset <= this.syntaxTree.range.end, "Invalid offset");

    // The baseline isn't exposed as a property, so we have this questionable workaround
    // https://github.com/w3c/mathml-core/issues/38
    // https://jsfiddle.net/se6n81rg/1/

    let positionReader: MathMLElement;

    if (offset == Number(this.syntaxTree.range.start)) {
      positionReader = this.startBaselineReader;
    } else if (offset == Number(this.syntaxTree.range.end)) {
      positionReader = this.endBaselineReader;
    } else {
      throw new Error("Don't know how to deal with this offset");
    }

    let { x, y } = positionReader.getBoundingClientRect();
    const caretSize = this.element.getFontSize();

    return {
      position: {
        x: x,
        y: y,
      },
      height: caretSize * 0.8,
      depth: caretSize * 0.2,
    };
  }

  getElements(): MathMLElement[] {
    // Or wrap the element in an extra mrow?
    return [this.startBaselineReader, this.element.element, this.endBaselineReader];
  }

  getChildren() {
    return this.element.getChildren();
  }
}
