import { ParseResult, SyntaxContainerNode, SyntaxNode } from "../core";
import { RenderedElement, RenderResult, Renderer } from "../rendering/render-result";
import { assert } from "../utils/assert";
import { MathMLRenderResult } from "./renderer/render-result";
import { SimpleContainerMathMLElement } from "./renderer/rendered-elements";
import { NothingMathMLElement } from "./renderer/rendered-nothing";
import { TextMathMLElement } from "./renderer/rendered-text-element";

export class MathMLRenderer implements Renderer<MathMLElement> {
  private readonly renderers: Map<string, (syntaxTree: SyntaxContainerNode) => RenderedElement<MathMLElement>> = new Map();

  constructor() {
    this.addRenderer("Nothing", (syntaxTree: SyntaxContainerNode) => {
      return new NothingMathMLElement(syntaxTree);
    });
    this.addRenderer("Variable", (syntaxTree: SyntaxContainerNode) => {
      return new TextMathMLElement(syntaxTree, "mi");
    });
    this.addRenderer("Number", (syntaxTree: SyntaxContainerNode) => {
      return new TextMathMLElement(syntaxTree, "mn");
    });
    this.addRenderer("String", (syntaxTree: SyntaxContainerNode) => {
      return new TextMathMLElement(syntaxTree, "mtext");
    });
    this.addRenderer("Fraction", (syntaxTree: SyntaxContainerNode) => {
      return new SimpleContainerMathMLElement(syntaxTree, "mfrac", this);
    });
    this.addRenderer("Root", (syntaxTree: SyntaxContainerNode) => {
      // We have to switch the arguments here, because MathML uses the second argument as the root
      syntaxTree.children.reverse();
      return new SimpleContainerMathMLElement(syntaxTree, "mroot", this);
    });
    ["Add", "Subtract", "Multiply", "FunctionApplication"].forEach((name) => {
      this.addRenderer(name, (syntaxTree: SyntaxContainerNode) => {
        return new SimpleContainerMathMLElement(syntaxTree, "mrow", this);
      });
    });
    this.addRenderer("Error", (syntaxTree: SyntaxContainerNode) => {
      const element = new SimpleContainerMathMLElement(syntaxTree, "merror", this);
      console.warn("Rendering error", syntaxTree, element);
      return element;
    });
    // TODO: all the others
  }

  private addRenderer(name: string, renderer: (syntaxTree: SyntaxContainerNode) => RenderedElement<MathMLElement>): void {
    assert(!this.renderers.has(name), `Renderer for ${name} already exists`);

    if (import.meta.env.DEV) {
      this.renderers.set(name, (syntaxTree: SyntaxContainerNode) => {
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

  render(syntaxTree: SyntaxContainerNode): RenderedElement<MathMLElement> {
    const renderer = this.renderers.get(syntaxTree.name);
    assert(renderer, `No renderer for "${syntaxTree.name}"`);

    const element = renderer(syntaxTree);
    return element;
  }
}
