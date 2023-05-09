import { SyntaxContainerNode } from "../../core";
import { RenderedElement, RenderedPosition } from "../../rendering/render-result";
import { assert } from "../../utils/assert";
import { MathMLTags } from "../mathml-spec";

export class SimpleContainerMathMLElement implements RenderedElement<MathMLElement> {
  element: MathMLElement;
  children: RenderedElement<MathMLElement>[] = [];

  constructor(public syntaxTree: SyntaxContainerNode, elementName: MathMLTags) {
    this.element = createMathElement(elementName, []);
  }
  getViewportPosition(offset: number): RenderedPosition {
    throw new Error("Method not implemented.");
  }
  getElements(): MathMLElement[] {
    return [this.element];
  }
  setChildren(children: RenderedElement<MathMLElement>[]): void {
    // TODO: Assert expected number of children for the given elementName

    assert(children.length === this.syntaxTree.children.length, "Invalid number of children");
    this.children = children;
    this.element.append(...children.map((c) => wrapInMRow(c.getElements())));
  }
  getChildren(): RenderedElement<MathMLElement>[] {
    return this.children;
  }
}

const mathNamespace = "http://www.w3.org/1998/Math/MathML";
export function createMathElement(tagName: MathMLTags, children: Node[]) {
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
export function wrapInMRow(elements: MathMLElement[]): MathMLElement {
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
