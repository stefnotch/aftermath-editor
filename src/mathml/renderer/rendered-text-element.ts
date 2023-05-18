import { SyntaxNode, offsetInRange } from "../../core";
import { Offset } from "../../math-layout/math-layout-offset";
import { RowIndex } from "../../math-layout/math-layout-zipper";
import { RenderedElement, RenderedPosition } from "../../rendering/render-result";
import { assert } from "../../utils/assert";
import { MathMLTags } from "../mathml-spec";
import { RenderedMathML, createMathElement } from "./rendered-element";
import { LeafMathMLElement } from "./rendered-leaf";

/**
 * A text math element with word wrapping.
 */
export class TextMathMLElement implements RenderedElement<MathMLElement> {
  element: RenderedMathML;
  private textElements: LeafMathMLElement[];

  constructor(public syntaxTree: SyntaxNode<"Leaves">, public rowIndex: RowIndex | null, elementName: MathMLTags) {
    this.textElements = syntaxTree.children.Leaves.map((v) => new LeafMathMLElement(v));
    let children: Text[] = [];
    for (let textElement of this.textElements) {
      children.push(...textElement.getElements());
    }
    this.element = new RenderedMathML(createMathElement(elementName, children));
  }
  getBounds() {
    return this.element.getBounds();
  }
  getViewportPosition(offset: Offset): RenderedPosition {
    assert(offsetInRange(offset, this.syntaxTree.range), "Invalid offset");

    const atEnd = offset >= Number(this.syntaxTree.range.end);
    const caretSize = this.element.getFontSize();

    const textElement = this.textElements.find((v) => offsetInRange(offset, v.syntaxTree.range));
    const x =
      textElement?.getViewportXPosition(offset)?.x ??
      (atEnd ? this.element.element.getBoundingClientRect().right : this.element.element.getBoundingClientRect().left);
    const baseline = textElement?.getBaseline(offset).y ?? this.element.element.getBoundingClientRect().bottom;

    return {
      position: { x: x, y: baseline },
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
