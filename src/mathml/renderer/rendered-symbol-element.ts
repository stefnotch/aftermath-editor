import { SyntaxNode, offsetInRange } from "../../core";
import { Offset } from "../../input-tree/math-layout-offset";
import { RowIndex } from "../../input-tree/row-indices";
import { RenderedElement } from "../../rendering/render-result";
import { ViewportCoordinate } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { MathMLTags } from "../mathml-spec";
import { RenderedMathML, createMathElement } from "./rendered-element";
import { LeafMathMLElement } from "./rendered-leaf";

/**
 * A symbol math element without word wrapping.
 */
export class SymbolMathMLElement implements RenderedElement<MathMLElement> {
  element: RenderedMathML;
  private textElement: LeafMathMLElement;

  constructor(public syntaxTree: SyntaxNode<"Leaf">, public rowIndex: RowIndex | null, elementName: MathMLTags) {
    this.textElement = new LeafMathMLElement(syntaxTree.children.Leaf);
    let children: Text[] = this.textElement.getElements();
    const mathElement = createMathElement(elementName, children);
    mathElement.style.whiteSpace = "nowrap";
    this.element = new RenderedMathML(mathElement);
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

    // Symbol elements might be stretchy, in which case they can become pretty large.
    // The baseline isn't exposed as a property, so we have this questionable workaround
    // https://github.com/w3c/mathml-core/issues/38
    // https://jsfiddle.net/se6n81rg/1/

    const baseline = boundingRect.bottom;
    return { x: x, y: baseline };
  }
  getElements() {
    return this.element.getElements();
  }
  getChildren() {
    return this.element.getChildren();
  }
}
