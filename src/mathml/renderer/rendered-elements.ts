import { SyntaxTree } from "../../core";
import { RenderedElement, RenderedPosition } from "../../rendering/render-result";
import { ViewportValue } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { MathMLTags } from "../mathml-spec";

// Hmm, we don't have MathRowDomTranslator anymore
// SimpleContainerMathMLElement is also too simplistic, since we frequently have a syntax tree node like "Add", which
// has a child inbetween the two operands, which is the operator. So we need to be able to render that operator.

export class SimpleContainerMathMLElement implements RenderedElement<MathMLElement> {
  element: MathMLElement;
  children: RenderedElement<MathMLElement>[] = [];

  constructor(public syntaxTree: SyntaxTree, elementName: MathMLTags) {
    this.element = createMathElement(elementName, []);
  }
  getElements(): MathMLElement[] {
    return [this.element];
  }
  setChildren(children: RenderedElement<MathMLElement>[]): void {
    // TODO: Assert expected number of children for the given elementName

    assert(children.length === this.syntaxTree.args.length, "Invalid number of children");
    this.children = children;
    this.element.append(...children.map((c) => wrapInMRow(c.getElements())));
  }
  getChildren(): RenderedElement<MathMLElement>[] {
    return this.children;
  }
}

export class TextMathMLElement implements RenderedElement<MathMLElement> {
  private static utf8Decoder = new TextDecoder("utf-8");

  element: MathMLElement;
  private baselineReaderElement: MathMLElement;

  constructor(public syntaxTree: SyntaxTree, elementName: MathMLTags) {
    this.baselineReaderElement = createMathElement("mphantom", []);
    this.element = createMathElement(elementName, [
      this.baselineReaderElement,
      document.createTextNode(TextMathMLElement.utf8Decoder.decode(syntaxTree.value)) ?? createPlaceholder(),
    ]);
  }
  getViewportPosition(offset: number): RenderedPosition {
    const baseline = this.baselineReaderElement.getBoundingClientRect().bottom;
    const caretSize = getFontSize(this.element);

    // offset
    // this.syntaxTree.range

    return {
      position: { x: x, y: baseline },
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

const mathNamespace = "http://www.w3.org/1998/Math/MathML";
function createMathElement(tagName: MathMLTags, children: Node[]) {
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
function wrapInMRow(elements: MathMLElement[]): MathMLElement {
  if (elements.length == 1) {
    return elements[0];
  } else {
    return createMathElement("mrow", elements);
  }
}

/**
 * @returns A placeholder for an empty element
 */
function createPlaceholder() {
  return document.createTextNode("⬚");
}

/**
 * @returns The font size of the given element, used for calculating how large the caret should be.
 */
function getFontSize(element: Element): ViewportValue {
  const fontSize = +globalThis.getComputedStyle(element).getPropertyValue("font-size").replace("px", "");
  assert(!isNaN(fontSize) && fontSize > 0);
  return fontSize;
}
