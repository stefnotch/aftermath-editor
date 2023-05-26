import { SyntaxLeafNode, offsetInRange } from "../../core";
import { Offset } from "../../input-tree/math-layout-offset";
import { ViewportValue } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { createPlaceholder } from "./rendered-element";

export class LeafMathMLElement {
  /**
   * One text element per grapheme
   */
  private textElements: Text[];

  constructor(public syntaxTree: SyntaxLeafNode) {
    this.textElements = syntaxTree.symbols.map((v) => document.createTextNode(v)) ?? [createPlaceholder()];
  }
  getViewportXPosition(offset: Offset): { x: ViewportValue } {
    assert(offsetInRange(offset, this.syntaxTree.range), "Invalid offset");
    const { graphemeText, atEnd } = this.getTextNodeAt(offset);
    const graphemeBounds = getTextBoundingBox(graphemeText);

    return {
      x: graphemeBounds.x + (atEnd ? graphemeBounds.width : 0),
    };
  }

  private getTextNodeAt(offset: Offset) {
    const graphemeOffset = offset - this.syntaxTree.range.start;
    const atEnd = graphemeOffset >= this.textElements.length;
    const graphemeText = this.textElements[atEnd ? this.textElements.length - 1 : graphemeOffset];
    return { graphemeText, atEnd };
  }

  getBaseline(offset: Offset): { y: ViewportValue } {
    assert(offsetInRange(offset, this.syntaxTree.range), "Invalid offset");
    const { graphemeText } = this.getTextNodeAt(offset);

    // This is correct, since we're creating one text element per grapheme
    const graphemeBounds = getTextBoundingBox(graphemeText);
    return {
      y: graphemeBounds.bottom,
    };
  }

  getElements(): Text[] {
    return this.textElements;
  }
}

/**
 * @returns The bounding box of the text.
 */
export function getTextBoundingBox(t: Text) {
  assert(t.isConnected);
  const range = document.createRange();
  range.selectNode(t);
  return range.getBoundingClientRect();
}

/** Gets information about a text node on the screen */
// @ts-ignore
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
