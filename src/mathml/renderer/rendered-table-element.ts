import { SyntaxNode, fromCoreRowIndex } from "../../core";
import { RowIndex } from "../../math-layout/math-layout-zipper";
import { RenderedElement, RenderedCaret, Renderer } from "../../rendering/render-result";
import { assert } from "../../utils/assert";
import { RenderedMathML, createMathElement, wrapInMRow } from "./rendered-element";

export class TableMathMLElement implements RenderedElement<MathMLElement> {
  element: RenderedMathML;
  startBaselineReader: MathMLElement;
  endBaselineReader: MathMLElement;

  constructor(public syntaxTree: SyntaxNode<"NewTable">, public rowIndex: RowIndex | null, renderer: Renderer<MathMLElement>) {
    assert(syntaxTree.children.NewTable.length > 0, "Needs at least one child");
    this.element = new RenderedMathML(createMathElement("mtable", []));
    this.startBaselineReader = createMathElement("mphantom", []);
    this.endBaselineReader = createMathElement("mphantom", []);

    const tableCells = syntaxTree.children.NewTable[0].map(([coreRowIndex, c]) =>
      renderer.render(c, fromCoreRowIndex(coreRowIndex))
    );
    const tableWidth = syntaxTree.children.NewTable[1];
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
    assert(this.element.getChildren().length === this.syntaxTree.children.NewTable[0].length, "Invalid number of children");
    assert(this.element.getChildren().length > 0, "Needs at least one rendered child");
  }

  getBounds() {
    return this.element.getBounds();
  }

  getViewportPosition(offset: number): RenderedCaret {
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
    return new RenderedCaret({ x: x, y: y }, caretSize);
  }

  getElements() {
    // Or wrap the element in an extra mrow?
    return [this.startBaselineReader, this.element.element, this.endBaselineReader];
  }

  getChildren() {
    return this.element.getChildren();
  }
}
