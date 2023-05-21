import { SyntaxNode, offsetInRange } from "../../core";
import { Offset } from "../../math-layout/math-layout-offset";
import { RowIndex } from "../../math-layout/math-layout-zipper";
import { RenderedElement, RenderedCaret } from "../../rendering/render-result";
import { assert } from "../../utils/assert";
import { MathMLTags } from "../mathml-spec";
import { RenderedMathML, createMathElement } from "./rendered-element";
import { LeafMathMLElement } from "./rendered-leaf";

/**
 * A symbol math element without word wrapping.
 */
export class SymbolMathMLElement implements RenderedElement<MathMLElement> {
  element: RenderedMathML;
  private textElements: LeafMathMLElement[];

  constructor(public syntaxTree: SyntaxNode<"Leaves">, public rowIndex: RowIndex | null, elementName: MathMLTags) {
    this.textElements = syntaxTree.children.Leaves.map((v) => new LeafMathMLElement(v));
    let children: Text[] = [];
    for (let textElement of this.textElements) {
      children.push(...textElement.getElements());
    }
    const mathElement = createMathElement(elementName, children);
    mathElement.style.whiteSpace = "nowrap";
    this.element = new RenderedMathML(mathElement);
  }

  getBounds() {
    return this.element.getBounds();
  }

  getViewportPosition(offset: Offset): RenderedCaret {
    assert(offsetInRange(offset, this.syntaxTree.range), "Invalid offset");

    const atEnd = offset >= Number(this.syntaxTree.range.end);
    const caretSize = this.element.getFontSize();

    const textElement = this.textElements.find((v) => offsetInRange(offset, v.syntaxTree.range));
    const x =
      textElement?.getViewportXPosition(offset)?.x ??
      (atEnd ? this.element.element.getBoundingClientRect().right : this.element.element.getBoundingClientRect().left);

    // Symbol elements might be stretchy, in which case they can become pretty large.
    // The baseline isn't exposed as a property, so we have this questionable workaround
    // https://github.com/w3c/mathml-core/issues/38
    // https://jsfiddle.net/se6n81rg/1/

    const baseline = textElement?.getBaseline(offset).y ?? this.element.element.getBoundingClientRect().bottom;
    return new RenderedCaret({ x: x, y: baseline }, caretSize);
  }
  getElements() {
    return this.element.getElements();
  }
  getChildren() {
    return this.element.getChildren();
  }
}
