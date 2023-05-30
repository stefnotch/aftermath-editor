import { SyntaxNode } from "../../core";
import { RowIndex } from "../../input-tree/row-indices";
import { RenderedElement, Renderer } from "../../rendering/render-result";
import { ViewportCoordinate } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { RenderedMathML, createMathElement, wrapInMRow } from "./rendered-element";

export class TableMathMLElement implements RenderedElement<MathMLElement> {
  element: RenderedMathML;
  startBaselineReader: MathMLElement;
  endBaselineReader: MathMLElement;

  constructor(public syntaxTree: SyntaxNode<"NewRows">, public rowIndex: RowIndex | null, renderer: Renderer<MathMLElement>) {
    assert(syntaxTree.children.NewRows.values.length > 0, "Needs at least one child");
    this.element = new RenderedMathML(createMathElement("mtable", []));
    this.startBaselineReader = createMathElement("mphantom", []);
    this.endBaselineReader = createMathElement("mphantom", []);
    const indexOfContainer = this.syntaxTree.range.start;
    assert(this.syntaxTree.range.start + 1 === this.syntaxTree.range.end, "Invalid range for a row container");

    const tableCells = syntaxTree.children.NewRows.values.map((c, rowIndex) =>
      renderer.render(c, [indexOfContainer, rowIndex])
    );
    const tableWidth = syntaxTree.children.NewRows.width;
    const children: MathMLElement[] = [];
    for (let i = 0; i < tableCells.length; i += tableWidth) {
      const tableRow = tableCells.slice(i, i + tableWidth);
      children.push(
        createMathElement(
          "mtr",
          tableRow.map((v) => createMathElement("mtd", [wrapInMRow(v.getElements())]))
        )
      );
    }
    this.element.setChildrenCustom(tableCells, children);
    assert(
      children.length === Math.floor(this.syntaxTree.children.NewRows.values.length / this.syntaxTree.children.NewRows.width),
      "Invalid number of children"
    );
    assert(this.element.getChildren().length === this.syntaxTree.children.NewRows.values.length, "Invalid number of children");
    assert(this.element.getChildren().length > 0, "Needs at least one rendered child");
  }

  getCaretSize() {
    return this.element.getCaretSize();
  }

  getBounds() {
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

  getElements() {
    // Or wrap the element in an extra mrow?
    return [this.startBaselineReader, this.element.element, this.endBaselineReader];
  }

  getChildren() {
    return this.element.getChildren();
  }
}
