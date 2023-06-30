import type { RenderedElement } from "../../rendering/render-result";
import type { ViewportRect, ViewportValue } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { type MathMLTags, MathMLTagsExpectedChildrenCount } from "../mathml-spec";

export class RenderedMathML {
  element: MathMLElement;
  private children: RenderedElement<MathMLElement>[] = [];

  constructor(element: MathMLElement) {
    this.element = element;
    assert(this.elementName in MathMLTagsExpectedChildrenCount, "Unknown element name: " + this.elementName);
  }

  getBounds(): ViewportRect {
    return getElementBounds(this.element);
  }

  getElements(): MathMLElement[] {
    return [this.element];
  }

  getCaretSize(): number {
    return getFontSize(this.element);
  }

  private get elementName() {
    return this.element.tagName.toLowerCase() as MathMLTags;
  }

  setChildren(children: RenderedElement<MathMLElement>[]): void {
    this.setChildrenCustom(
      children,
      children.map((v) => wrapInMRow(v.getElements()))
    );
  }

  setChildrenCustom(children: RenderedElement<MathMLElement>[], childElements: readonly Node[]): void {
    assert(
      MathMLTagsExpectedChildrenCount[this.elementName] === null ||
        MathMLTagsExpectedChildrenCount[this.elementName] === children.length,
      "Invalid number of children for " + this.elementName
    );
    this.children = children;
    this.element.append(...childElements);
  }

  getChildren(): ReadonlyArray<RenderedElement<MathMLElement>> {
    return this.children;
  }
}

const mathNamespace = "http://www.w3.org/1998/Math/MathML";
export function createMathElement(tagName: MathMLTags, children: ReadonlyArray<Node>) {
  const element = document.createElementNS(mathNamespace, tagName);
  children.forEach((c) => {
    element.appendChild(c);
  });
  return element;
}

/**
 * Optionally wrap the elements in an mrow if there is more than one element.
 * Useful for MathML elements which expect a very specific number of children.
 */
export function wrapInMRow(elements: ReadonlyArray<MathMLElement>): MathMLElement {
  if (elements.length == 1) {
    return elements[0];
  } else {
    return createMathElement("mrow", elements);
  }
}

/**
 * @returns A placeholder for an empty element
 */
export function createPlaceholder() {
  return document.createTextNode("⬚");
}

/**
 * @returns The bounding box of the given element.
 */
export function getElementBounds(element: Element): ViewportRect {
  const bounds = element.getBoundingClientRect();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

/**
 * @returns The font size of the given element, used for calculating how large the caret should be.
 */
export function getFontSize(element: Element): ViewportValue {
  const fontSize = +globalThis.getComputedStyle(element).getPropertyValue("font-size").replace("px", "");
  assert(!isNaN(fontSize) && fontSize > 0);
  return fontSize;
}
