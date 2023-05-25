import { SyntaxNode } from "../../core";
import { RowIndex } from "../../math-layout/math-layout-zipper";
import { RenderedElement, Renderer } from "../../rendering/render-result";
import { ViewportCoordinate, ViewportRect } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { MathMLTags } from "../mathml-spec";
import { RenderedMathML, createMathElement } from "./rendered-element";

/**
 * Renders something that starts new rows, like a mfrac.
 */
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

    this.element.setChildren(syntaxTree.children.NewRows.map(([rowIndex, c]) => renderer.render(c, rowIndex)));
    assert(this.element.getChildren().length === this.syntaxTree.children.NewRows.length, "Invalid number of children");
    assert(this.element.getChildren().length > 0, "Needs at least one rendered child");
  }

  getCaretSize() {
    return this.element.getCaretSize();
  }
  getBounds(): ViewportRect {
    return this.element.getBounds();
  }

  getCaretPosition(offset: number): ViewportCoordinate {
    assert(this.syntaxTree.range.start <= offset && offset <= this.syntaxTree.range.end, "Invalid offset");

    // The baseline isn't exposed as a property, so we have this questionable workaround
    // https://github.com/w3c/mathml-core/issues/38
    // https://jsfiddle.net/se6n81rg/1/

    let positionReader: MathMLElement;

    if (offset == this.syntaxTree.range.start) {
      positionReader = this.startBaselineReader;
    } else if (offset == this.syntaxTree.range.end) {
      positionReader = this.endBaselineReader;
    } else {
      throw new Error("Don't know how to deal with this offset");
    }

    let { x, y } = positionReader.getBoundingClientRect();
    return { x: x, y: y };
  }

  getElements(): MathMLElement[] {
    // Or wrap the element in an extra mrow?
    return [this.startBaselineReader, this.element.element, this.endBaselineReader];
  }

  getChildren() {
    return this.element.getChildren();
  }
}
