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
      // TODO: Or do I render an empty mrow?
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
    // TODO: all the others
  }

  private addRenderer(name: string, renderer: (syntaxTree: SyntaxContainerNode) => RenderedElement<MathMLElement>): void {
    assert(!this.renderers.has(name), `Renderer for ${name} already exists`);
    this.renderers.set(name, renderer);
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
