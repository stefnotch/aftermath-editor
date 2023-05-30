import { SyntaxNode, offsetInRange } from "../../core";
import { Offset } from "../../input-tree/input-offset";
import { RowIndex } from "../../input-tree/row-indices";
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
  private textElement: LeafMathMLElement;

  constructor(public syntaxTree: SyntaxNode<"Leaf">, public rowIndex: RowIndex | null, elementName: MathMLTags) {
    this.textElement = new LeafMathMLElement(syntaxTree.children.Leaf);
    let children: Text[] = this.textElement.getElements();
    this.element = new RenderedMathML(createMathElement(elementName, children));
  }
  getCaretSize() {
    return this.element.getCaretSize();
  }
  getBounds() {
    return this.element.getBounds();
  }
  getCaretPosition(offset: Offset): ViewportCoordinate {
    assert(offsetInRange(offset, this.syntaxTree.range), "Invalid offset");

    const boundingRect = this.element.element.getBoundingClientRect();
    let x: number;
    if (offset <= this.syntaxTree.range.start) {
      x = boundingRect.left;
    } else if (offset >= this.syntaxTree.range.end) {
      x = boundingRect.right;
    } else {
      x = this.textElement.getViewportXPosition(offset).x;
    }

    const baseline = this.textElement.getBaseline(offset).y;
    return { x: x, y: baseline };
  }
  getElements() {
    return this.element.getElements();
  }
  getChildren() {
    return this.element.getChildren();
  }
}
