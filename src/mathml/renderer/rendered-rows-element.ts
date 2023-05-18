import { SyntaxNode, fromCoreRowIndex } from "../../core";
import { RowIndex } from "../../math-layout/math-layout-zipper";
import { RenderedElement, RenderedPosition, Renderer } from "../../rendering/render-result";
import { ViewportRect } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { MathMLTags, MathMLTagsExpectedChildrenCount } from "../mathml-spec";
import { createMathElement, getElementBounds, wrapInMRow } from "./rendered-element";
import { getFontSize } from "./rendered-symbol-element";

export class RowsContainerMathMLElement implements RenderedElement<MathMLElement> {
  element: MathMLElement;
  children: RenderedElement<MathMLElement>[] = [];
  startBaselineReader: MathMLElement;
  endBaselineReader: MathMLElement;

  constructor(
    public syntaxTree: SyntaxNode<"NewRows">,
    public rowIndex: RowIndex | null,
    elementName: MathMLTags,
    renderer: Renderer<MathMLElement>
  ) {
    assert(syntaxTree.children.NewRows.length > 0, "Needs at least one child");
    this.element = createMathElement(elementName, []);
    this.startBaselineReader = createMathElement("mphantom", []);
    this.endBaselineReader = createMathElement("mphantom", []);

    this.setChildren(
      elementName,
      syntaxTree.children.NewRows.map(([coreRowIndex, c]) => renderer.render(c, fromCoreRowIndex(coreRowIndex)))
    );
    assert(this.children.length > 0, "Needs at least one rendered child");
  }

  getBounds(): ViewportRect {
    return getElementBounds(this.element);
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
    const caretSize = getFontSize(this.element);

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
    return [this.startBaselineReader, this.element, this.endBaselineReader];
  }

  private setChildren(elementName: MathMLTags, children: RenderedElement<MathMLElement>[]): void {
    assert(
      MathMLTagsExpectedChildrenCount[elementName] === null || MathMLTagsExpectedChildrenCount[elementName] === children.length,
      "Invalid number of children for " + elementName
    );

    assert(children.length === this.syntaxTree.children.NewRows.length, "Invalid number of children");
    this.children = children;
    this.element.append(...children.map((v) => wrapInMRow(v.getElements())));
  }

  getChildren(): RenderedElement<MathMLElement>[] {
    return this.children;
  }
}
