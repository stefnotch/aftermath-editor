import { ParseResult, SyntaxTree } from "../core";
import { RenderedElement, RenderResult, Renderer } from "../rendering/render-result";
import { assert } from "../utils/assert";
import { MathMLRenderResult } from "./renderer/render-result";
import { SimpleContainerMathMLElement, TextMathMLElement } from "./renderer/rendered-elements";

export class MathMLRenderer implements Renderer<MathMLElement> {
  private readonly renderers: Map<string, (syntaxTree: SyntaxTree) => RenderedElement<MathMLElement>> = new Map();

  constructor() {
    this.addRenderer("Variable", (syntaxTree: SyntaxTree) => {
      return new TextMathMLElement(syntaxTree, "mi");
    });
    this.addRenderer("Number", (syntaxTree: SyntaxTree) => {
      return new TextMathMLElement(syntaxTree, "mn");
    });
    this.addRenderer("String", (syntaxTree: SyntaxTree) => {
      return new TextMathMLElement(syntaxTree, "mtext");
    });
    // TODO: all the others
  }

  private addRenderer(name: string, renderer: (syntaxTree: SyntaxTree) => RenderedElement<MathMLElement>): void {
    assert(!this.renderers.has(name), `Renderer for ${name} already exists`);
    this.renderers.set(name, renderer);
  }

  canRender(syntaxTreeNames: string[]): boolean {
    return syntaxTreeNames.every((name) => this.renderers.has(name));
  }

  render(parsed: ParseResult): RenderResult<MathMLElement> {
    // TODO: Rendering errors is like rendering non-semantic annotations
    const element = this.renderSyntaxTree(parsed.value);
    return new MathMLRenderResult(element, parsed);
  }

  private renderSyntaxTree(syntaxTree: SyntaxTree): RenderedElement<MathMLElement> {
    const renderer = this.renderers.get(syntaxTree.name);
    assert(renderer, `No renderer for "${syntaxTree.name}"`);

    const element = renderer(syntaxTree);
    element.setChildren(syntaxTree.args.map((child) => this.renderSyntaxTree(child)));

    return element;
  }
}
