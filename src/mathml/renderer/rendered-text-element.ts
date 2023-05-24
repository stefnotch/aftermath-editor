import { SyntaxNode, offsetInRange } from "../../core";
import { Offset } from "../../math-layout/math-layout-offset";
import { RowIndex } from "../../math-layout/math-layout-zipper";
import { RenderedElement } from "../../rendering/render-result";
import { ViewportCoordinate } from "../../rendering/viewport-coordinate";
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
  getCaretSize() {
    return this.element.getCaretSize();
  }
  getContentBounds() {
    return this.element.getContentBounds();
  }
  getBounds() {
    return this.element.getBounds();
  }
  getCaretPosition(offset: Offset): ViewportCoordinate {
    assert(offsetInRange(offset, this.syntaxTree.range), "Invalid offset");

    const atEnd = offset >= Number(this.syntaxTree.range.end);

    const textElement = this.textElements.find((v) => offsetInRange(offset, v.syntaxTree.range));
    const x =
      textElement?.getViewportXPosition(offset)?.x ??
      (atEnd ? this.element.element.getBoundingClientRect().right : this.element.element.getBoundingClientRect().left);
    const baseline = textElement?.getBaseline(offset).y ?? this.element.element.getBoundingClientRect().bottom;

    return { x: x, y: baseline };
  }
  getElements() {
    return this.element.getElements();
  }
  getChildren() {
    return this.element.getChildren();
  }
}
