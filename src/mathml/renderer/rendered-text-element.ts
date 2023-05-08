import { SyntaxContainerNode } from "../../core";
import { Offset } from "../../math-layout/math-layout-offset";
import { RenderedElement, RenderedPosition } from "../../rendering/render-result";
import { ViewportValue } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { MathMLTags } from "../mathml-spec";
import { createMathElement, createPlaceholder } from "./rendered-elements";

export class TextMathMLElement implements RenderedElement<MathMLElement> {
  private static utf8Decoder = new TextDecoder("utf-8");

  element: MathMLElement;
  private textElements: Text[];
  private baselineReaderElement: MathMLElement;

  constructor(public syntaxTree: SyntaxContainerNode, elementName: MathMLTags) {
    this.baselineReaderElement = createMathElement("mphantom", []);
    // TODO: syntaxTree.value is no longer correct
    this.textElements = syntaxTree.children[0].document.createTextNode(
      TextMathMLElement.utf8Decoder.decode(syntaxTree.value)
    ) ?? [createPlaceholder()];
    this.element = createMathElement(elementName, [this.baselineReaderElement, this.textElement]);
  }
  getViewportPosition(offset: Offset): RenderedPosition {
    // The baseline isn't exposed as a property, so we have this workaround https://github.com/w3c/mathml-core/issues/38
    const baseline = this.baselineReaderElement.getBoundingClientRect().bottom;
    const caretSize = getFontSize(this.element);

    const graphemeOffset = offset - this.syntaxTree.range.start;
    const atEnd = graphemeOffset >= this.textElements.length;
    const graphemeBounds = getTextBoundingBox(
      atEnd ? this.textElements[this.textElements.length - 1] : this.textElements[graphemeOffset]
    );

    return {
      position: { x: graphemeBounds.x + (atEnd ? graphemeBounds.width : 0), y: baseline },
      height: caretSize * 0.8,
      depth: caretSize * 0.2,
    };
  }
  getElements(): MathMLElement[] {
    return [this.element];
  }
  setChildren(_children: RenderedElement<MathMLElement>[]): void {
    throw new Error("TextMathMLElement cannot have children");
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

/** Gets information about a text node on the screen */
function getTextLayout(t: Text, index: number) {
  function getCharacterBoundingBox(t: Text, index: number) {
    const range = document.createRange();
    range.setStart(t, index);
    if (t.length > 0) {
      range.setEnd(t, index + 1); // Select the entire character
    }
    return range.getBoundingClientRect();
  }

  assert(t.isConnected);
  const atEnd = index >= t.length;
  const boundingBox = !atEnd ? getCharacterBoundingBox(t, index) : getCharacterBoundingBox(t, Math.max(0, t.length - 1));

  return {
    x: boundingBox.x + (atEnd ? boundingBox.width : 0),
    y: boundingBox.bottom,
    height: boundingBox.height,
  };
}

/**
 * @returns The bounding box of the text.
 */
function getTextBoundingBox(t: Text) {
  const range = document.createRange();
  range.selectNode(t);
  return range.getBoundingClientRect();
}
