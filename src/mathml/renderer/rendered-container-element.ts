import { SyntaxNode } from "../../core";
import { RowIndex } from "../../math-layout/math-layout-zipper";
import { RenderedElement, RenderedPosition, Renderer } from "../../rendering/render-result";
import { assert } from "../../utils/assert";
import { MathMLTags } from "../mathml-spec";
import { RenderedMathML, createMathElement } from "./rendered-element";

export class SimpleContainerMathMLElement implements RenderedElement<MathMLElement> {
  element: RenderedMathML;

  constructor(
    public syntaxTree: SyntaxNode<"Containers">,
    public rowIndex: RowIndex | null,
    elementName: MathMLTags,
    renderer: Renderer<MathMLElement>
  ) {
    assert(syntaxTree.children.Containers.length > 0, "Needs at least one child");
    this.element = new RenderedMathML(createMathElement(elementName, []));

    this.element.setChildren(syntaxTree.children.Containers.map((c) => renderer.render(c, null)));
    assert(this.element.getChildren().length === this.syntaxTree.children.Containers.length, "Invalid number of children");
    assert(this.element.getChildren().length > 0, "Needs at least one rendered child");
  }

  getBounds() {
    return this.element.getBounds();
  }

  getViewportPosition(offset: number): RenderedPosition {
    assert(this.syntaxTree.range.start <= offset && offset <= this.syntaxTree.range.end, "Invalid offset");
    // Don't look at children that are on a new row
    const child = this.element
      .getChildren()
      .find((c) => c.syntaxTree.range.start <= offset && offset <= c.syntaxTree.range.end);
    if (child) {
      return child.getViewportPosition(offset);
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
