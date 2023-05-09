import { SyntaxContainerNode } from "../../core";
import { Offset } from "../../math-layout/math-layout-offset";
import { RenderedElement, RenderedPosition } from "../../rendering/render-result";
import { ViewportValue } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { MathMLTags } from "../mathml-spec";
import { createMathElement } from "./rendered-elements";
import { LeafMathMLElement } from "./rendered-leaf";

export class TextMathMLElement implements RenderedElement<MathMLElement> {
  element: MathMLElement;
  private textElement: LeafMathMLElement;
  private baselineReaderElement: MathMLElement;

  constructor(public syntaxTree: SyntaxContainerNode, elementName: MathMLTags) {
    this.baselineReaderElement = createMathElement("mphantom", []);
    assert(syntaxTree.children.length === 1);

    const text = syntaxTree.children[0];
    assert("Leaf" in text);

    this.textElement = new LeafMathMLElement(text.Leaf);
    this.element = createMathElement(elementName, [this.baselineReaderElement, ...this.textElement.getElements()]);
  }
  getViewportPosition(offset: Offset): RenderedPosition {
    // The baseline isn't exposed as a property, so we have this workaround https://github.com/w3c/mathml-core/issues/38
    const baseline = this.baselineReaderElement.getBoundingClientRect().bottom;
    const caretSize = getFontSize(this.element);

    const { x } = this.textElement.getViewportXPosition(offset);

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
