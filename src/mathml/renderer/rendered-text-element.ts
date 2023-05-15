import { SyntaxLeafNode, SyntaxNode, offsetInRange } from "../../core";
import { Offset } from "../../math-layout/math-layout-offset";
import { RenderedElement, RenderedPosition } from "../../rendering/render-result";
import { ViewportRect, ViewportValue } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { MathMLTags } from "../mathml-spec";
import { createMathElement, getElementBounds } from "./rendered-elements";
import { LeafMathMLElement, getTextBoundingBox } from "./rendered-leaf";

export class TextMathMLElement implements RenderedElement<MathMLElement> {
  element: MathMLElement;
  private textElements: LeafMathMLElement[];
  private baselineReaderElement: Text;

  constructor(public syntaxTree: SyntaxNode<{ Leaves: SyntaxLeafNode[] }>, elementName: MathMLTags) {
    // TODO: That baseline is only correct if we don't have any line wrapping.
    this.baselineReaderElement = document.createTextNode("");

    this.textElements = syntaxTree.children.Leaves.map((v) => new LeafMathMLElement(v));
    let children = [this.baselineReaderElement];
    for (let textElement of this.textElements) {
      children.push(...textElement.getElements());
    }
    this.element = createMathElement(elementName, children);
  }
  getBounds(): ViewportRect {
    return getElementBounds(this.element);
  }
  getViewportPosition(offset: Offset): RenderedPosition {
    assert(offsetInRange(offset, this.syntaxTree.range), "Invalid offset");
    // The baseline isn't exposed as a property, so we have this questionable workaround https://github.com/w3c/mathml-core/issues/38
    const baseline = getTextBoundingBox(this.baselineReaderElement).bottom;
    const caretSize = getFontSize(this.element);

    const { x } =
      this.textElements.find((v) => offsetInRange(offset, v.syntaxTree.range))?.getViewportXPosition(offset) ??
      getTextBoundingBox(this.baselineReaderElement);

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
function getFontSize(element: Element): ViewportValue {
  const fontSize = +globalThis.getComputedStyle(element).getPropertyValue("font-size").replace("px", "");
  assert(!isNaN(fontSize) && fontSize > 0);
  return fontSize;
}
