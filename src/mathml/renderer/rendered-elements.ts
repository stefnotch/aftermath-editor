import { SyntaxContainerNode } from "../../core";
import { RenderedElement, RenderedPosition, Renderer } from "../../rendering/render-result";
import { assert, assertUnreachable } from "../../utils/assert";
import { MathMLTags, MathMLTagsExpectedChildrenCount } from "../mathml-spec";
import { LeafMathMLElement } from "./rendered-leaf";
import { TextMathMLElement } from "./rendered-text-element";

export class SimpleContainerMathMLElement implements RenderedElement<MathMLElement> {
  element: MathMLElement;
  children: RenderedElement<MathMLElement>[] = [];

  constructor(public syntaxTree: SyntaxContainerNode, elementName: MathMLTags, renderer: Renderer<MathMLElement>) {
    this.element = createMathElement(elementName, []);

    this.setChildren(
      elementName,
      this.syntaxTree.children.map((c) => {
        if ("Container" in c) {
          return renderer.render(c.Container);
        } else if ("Leaf" in c) {
          if (c.Leaf.node_type === "Operator") {
            return new TextMathMLElement(
              {
                name: syntaxTree.name,
                children: [c],
                range: c.Leaf.range,
                value: [],
              },
              "mo"
            );
          } else {
            return new LeafMathMLElement(c.Leaf);
          }
        } else {
          assertUnreachable(c);
        }
      })
    );
  }
  getViewportPosition(offset: number): RenderedPosition {
    throw new Error("Method not implemented.");
  }
  getElements(): MathMLElement[] {
    return [this.element];
  }
  private setChildren(elementName: MathMLTags, children: (RenderedElement<MathMLElement> | LeafMathMLElement)[]): void {
    assert(
      MathMLTagsExpectedChildrenCount[elementName] === null || MathMLTagsExpectedChildrenCount[elementName] === children.length,
      "Invalid number of children for " + elementName
    );

    assert(children.length === this.syntaxTree.children.length, "Invalid number of children");
    // Ah yes, using flatMap to avoid having to do an unsafe type cast
    this.children = children.flatMap((c) => (c instanceof LeafMathMLElement ? [] : [c]));
    this.element.append(
      ...children.flatMap(
        (c): Array<Node> => (c instanceof LeafMathMLElement ? c.getElements() : [wrapInMRow(c.getElements())])
      )
    );
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
