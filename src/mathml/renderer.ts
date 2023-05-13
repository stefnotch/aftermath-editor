import { ParseResult, SyntaxNode, hasContainersChildren, hasLeavesChildren } from "../core";
import { RenderedElement, RenderResult, Renderer } from "../rendering/render-result";
import { assert } from "../utils/assert";
import { MathMLRenderResult } from "./renderer/render-result";
import { SimpleContainerMathMLElement } from "./renderer/rendered-elements";
import { NothingMathMLElement } from "./renderer/rendered-nothing";
import { TextMathMLElement } from "./renderer/rendered-text-element";

export class MathMLRenderer implements Renderer<MathMLElement> {
  private readonly renderers: Map<string, (syntaxTree: SyntaxNode) => RenderedElement<MathMLElement>> = new Map();

  constructor() {
    this.addRenderer("Nothing", (syntaxTree: SyntaxNode) => {
      return new NothingMathMLElement(syntaxTree);
    });
    this.addRenderer("Variable", (syntaxTree: SyntaxNode) => {
      assert(hasLeavesChildren(syntaxTree));
      return new TextMathMLElement(syntaxTree, "mi");
    });
    this.addRenderer("Number", (syntaxTree: SyntaxNode) => {
      assert(hasLeavesChildren(syntaxTree));
      return new TextMathMLElement(syntaxTree, "mn");
    });
    this.addRenderer("String", (syntaxTree: SyntaxNode) => {
      assert(hasLeavesChildren(syntaxTree));
      return new TextMathMLElement(syntaxTree, "mtext");
    });
    this.addRenderer("Fraction", (syntaxTree: SyntaxNode) => {
      assert(hasContainersChildren(syntaxTree));
      return new SimpleContainerMathMLElement(syntaxTree, "mfrac", this);
    });
    this.addRenderer("Root", (syntaxTree: SyntaxNode) => {
      // We have to switch the arguments here, because MathML uses the second argument as the root
      assert(hasContainersChildren(syntaxTree));
      syntaxTree.children.Containers.reverse();
      return new SimpleContainerMathMLElement(syntaxTree, "mroot", this);
    });
    ["Add", "Subtract", "Multiply", "FunctionApplication"].forEach((name) => {
      this.addRenderer(name, (syntaxTree: SyntaxNode) => {
        assert(hasContainersChildren(syntaxTree));
        return new SimpleContainerMathMLElement(syntaxTree, "mrow", this);
      });
    });
    this.addRenderer("Error", (syntaxTree: SyntaxNode) => {
      assert(hasLeavesChildren(syntaxTree));
      const element = new TextMathMLElement(syntaxTree, "merror");
      console.warn("Rendering error", syntaxTree, element);
      return element;
    });
    // TODO: all the others
  }

  private addRenderer(name: string, renderer: (syntaxTree: SyntaxNode) => RenderedElement<MathMLElement>): void {
    assert(!this.renderers.has(name), `Renderer for ${name} already exists`);

    if (import.meta.env.DEV) {
      this.renderers.set(name, (syntaxTree: SyntaxNode) => {
        const rendered = renderer(syntaxTree);
        rendered.getElements().forEach((v) => v.setAttribute("data-renderer-name", name));
        return rendered;
      });
    } else {
      this.renderers.set(name, renderer);
    }
  }

  canRender(syntaxTreeNames: string[]): boolean {
    return syntaxTreeNames.every((name) => this.renderers.has(name));
  }

  renderAll(parsed: ParseResult): RenderResult<MathMLElement> {
    // TODO: Rendering errors is like rendering non-semantic annotations
    const element = this.render(parsed.value);
    return new MathMLRenderResult(element, parsed);
  }

  render(syntaxTree: SyntaxNode): RenderedElement<MathMLElement> {
    const renderer = this.renderers.get(syntaxTree.name);
    assert(renderer, `No renderer for "${syntaxTree.name}"`);

    const element = renderer(syntaxTree);
    return element;
  }
}
