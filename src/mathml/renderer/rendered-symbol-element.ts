import { SyntaxLeafNode, SyntaxNode, offsetInRange } from "../../core";
import { Offset } from "../../math-layout/math-layout-offset";
import { RenderedElement, RenderedPosition } from "../../rendering/render-result";
import { ViewportRect, ViewportValue } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { MathMLTags } from "../mathml-spec";
import { createMathElement, getElementBounds } from "./rendered-element";
import { LeafMathMLElement } from "./rendered-leaf";

/**
 * A symbol math element without word wrapping.
 */
export class SymbolMathMLElement implements RenderedElement<MathMLElement> {
  element: MathMLElement;
  private textElements: LeafMathMLElement[];

  constructor(public syntaxTree: SyntaxNode<{ Leaves: SyntaxLeafNode[] }>, elementName: MathMLTags) {
    this.textElements = syntaxTree.children.Leaves.map((v) => new LeafMathMLElement(v));
    let children: Text[] = [];
    for (let textElement of this.textElements) {
      children.push(...textElement.getElements());
    }
    this.element = createMathElement(elementName, children);
    this.element.style.whiteSpace = "nowrap";
  }

  getBounds(): ViewportRect {
    return getElementBounds(this.element);
  }

  getViewportPosition(offset: Offset): RenderedPosition {
    assert(offsetInRange(offset, this.syntaxTree.range), "Invalid offset");

    const atEnd = offset >= Number(this.syntaxTree.range.end);
    const caretSize = getFontSize(this.element);

    const textElement = this.textElements.find((v) => offsetInRange(offset, v.syntaxTree.range));
    const x =
      textElement?.getViewportXPosition(offset)?.x ??
      (atEnd ? this.element.getBoundingClientRect().right : this.element.getBoundingClientRect().left);

    // Symbol elements might be stretchy, in which case they can become pretty large.
    // The baseline isn't exposed as a property, so we have this questionable workaround
    // https://github.com/w3c/mathml-core/issues/38
    // https://jsfiddle.net/se6n81rg/1/

    const baseline = textElement?.getBaseline(offset).y ?? this.element.getBoundingClientRect().bottom;

    return {
      position: { x: x, y: baseline },
      height: caretSize * 0.8,
      depth: caretSize * 0.2,
    };
  }
  getElements(): MathMLElement[] {
    return [this.element];
  }
  getChildren(): RenderedElement<MathMLElement>[] {
    return [];
  }
}

/**
 * @returns The font size of the given element, used for calculating how large the caret should be.
 */
export function getFontSize(element: Element): ViewportValue {
  const fontSize = +globalThis.getComputedStyle(element).getPropertyValue("font-size").replace("px", "");
  assert(!isNaN(fontSize) && fontSize > 0);
  return fontSize;
}
