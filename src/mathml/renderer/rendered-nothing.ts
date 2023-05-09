import { SyntaxContainerNode } from "../../core";
import { Offset } from "../../math-layout/math-layout-offset";
import { RenderedElement, RenderedPosition } from "../../rendering/render-result";
import { ViewportValue } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { createMathElement, createPlaceholder } from "./rendered-elements";

export class NothingMathMLElement implements RenderedElement<MathMLElement> {
  element: MathMLElement;
  private baselineReaderElement: MathMLElement;

  constructor(public syntaxTree: SyntaxContainerNode) {
    this.baselineReaderElement = createMathElement("mphantom", []);
    assert(syntaxTree.children.length === 0);

    this.element = createMathElement("mrow", [this.baselineReaderElement, createPlaceholder()]);
  }
  getViewportPosition(offset: Offset): RenderedPosition {
    assert(offset === 0, "NothingMathMLElement only supports offset 0");
    // The baseline isn't exposed as a property, so we have this workaround https://github.com/w3c/mathml-core/issues/38
    const baseline = this.baselineReaderElement.getBoundingClientRect().bottom;
    const caretSize = getFontSize(this.element);

    const boundingBox = this.element.getBoundingClientRect();

    return {
      position: {
        x: (boundingBox.left + boundingBox.right) / 2,
        y: baseline,
      },
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