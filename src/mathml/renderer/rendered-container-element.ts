import type { SyntaxNodeWith } from "../../core";
import type { RowIndex } from "../../input-tree/row-indices";
import type { ImmediateRenderingOptions, RenderedElement, Renderer } from "../../rendering/render-result";
import type { ViewportCoordinate } from "../../rendering/viewport-coordinate";
import { assert } from "../../utils/assert";
import type { MathMLTags } from "../mathml-spec";
import { RenderedMathML, createMathElement } from "./rendered-element";

/**
 * Renders something on the same row.
 */
export class SimpleContainerMathMLElement implements RenderedElement<MathMLElement> {
  element: RenderedMathML;

  constructor(
    public syntaxTree: SyntaxNodeWith<"Children">,
    public rowIndex: RowIndex | null,
    elementName: MathMLTags,
    renderer: Renderer<MathMLElement>,
    options: Partial<ImmediateRenderingOptions<MathMLElement>> = {}
  ) {
    assert(syntaxTree.children.Children.length > 0, "Needs at least one child");
    this.element = new RenderedMathML(createMathElement(elementName, []));

    this.element.setChildren(syntaxTree.children.Children.map((c) => renderer.render(c, null, options)));
    assert(this.element.getChildren().length === this.syntaxTree.children.Children.length, "Invalid number of children");
    assert(this.element.getChildren().length > 0, "Needs at least one rendered child");
  }
  getCaretSize(): number {
    return this.element.getCaretSize();
  }

  getBounds() {
    return this.element.getBounds();
  }

  getCaretPosition(offset: number): ViewportCoordinate {
    assert(this.syntaxTree.range.start <= offset && offset <= this.syntaxTree.range.end, "Invalid offset");
    // Don't look at children that are on a new row
    const child = this.element
      .getChildren()
      .find((c) => c.syntaxTree.range.start <= offset && offset <= c.syntaxTree.range.end);
    if (child) {
      return child.getCaretPosition(offset);
    } else {
      throw new Error("Should not happen");
    }
  }

  getElements() {
    return this.element.getElements();
  }
  getChildren() {
    return this.element.getChildren();
  }
}
