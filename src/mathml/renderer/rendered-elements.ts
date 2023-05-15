import { SyntaxNode } from "../../core";
import { RenderedElement, RenderedPosition, Renderer } from "../../rendering/render-result";
import { ViewportRect } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import { MathMLTags, MathMLTagsExpectedChildrenCount } from "../mathml-spec";

export class SimpleContainerMathMLElement implements RenderedElement<MathMLElement> {
  element: MathMLElement;
  children: RenderedElement<MathMLElement>[] = [];

  constructor(
    public syntaxTree: SyntaxNode<{ Containers: SyntaxNode[] }>,
    elementName: MathMLTags,
    renderer: Renderer<MathMLElement>
  ) {
    assert(syntaxTree.children.Containers.length > 0, "Needs at least one child");
    this.element = createMathElement(elementName, []);

    this.setChildren(
      elementName,
      syntaxTree.children.Containers.map((c) => renderer.render(c))
    );
    assert(this.children.length > 0, "Needs at least one rendered child");
  }
  getBounds(): ViewportRect {
    return getElementBounds(this.element);
  }
  getViewportPosition(offset: number): RenderedPosition {
    // TODO: This breaks when children have a row_index

    assert(this.syntaxTree.range.start <= offset && offset <= this.syntaxTree.range.end, "Invalid offset");
    const child = this.children.find((c) => c.syntaxTree.range.start <= offset && offset <= c.syntaxTree.range.end);
    if (child) {
      return child.getViewportPosition(offset);
    } else {
      throw new Error("Don't know how to render this offset");
    }
  }
  getElements(): MathMLElement[] {
    return [this.element];
  }
  private setChildren(elementName: MathMLTags, children: RenderedElement<MathMLElement>[]): void {
    assert(
      MathMLTagsExpectedChildrenCount[elementName] === null || MathMLTagsExpectedChildrenCount[elementName] === children.length,
      "Invalid number of children for " + elementName
    );

    assert(children.length === this.syntaxTree.children.Containers.length, "Invalid number of children");
    this.children = children;
    this.element.append(...children.map((v) => wrapInMRow(v.getElements())));
  }
  getChildren(): RenderedElement<MathMLElement>[] {
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

export function getElementBounds(element: Element): ViewportRect {
  const bounds = element.getBoundingClientRect();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}
