import {
  NodeIdentifier,
  NodeIdentifierJoined,
  ParseResult,
  SyntaxNode,
  hasContainersChildren,
  hasLeavesChildren,
  joinNodeIdentifier,
} from "../core";
import { RenderedElement, RenderResult, Renderer } from "../rendering/render-result";
import { assert } from "../utils/assert";
import { MathMLRenderResult } from "./renderer/render-result";
import { SimpleContainerMathMLElement } from "./renderer/rendered-elements";
import { NothingMathMLElement } from "./renderer/rendered-nothing";
import { TextMathMLElement } from "./renderer/rendered-text-element";

export class MathMLRenderer implements Renderer<MathMLElement> {
  private readonly renderers: Map<NodeIdentifierJoined, (syntaxTree: SyntaxNode) => RenderedElement<MathMLElement>> = new Map();

  constructor() {
    {
      const builtIn = this.rendererCollection("BuiltIn");
      builtIn.add("Nothing", (syntaxTree) => {
        return new NothingMathMLElement(syntaxTree);
      });
      builtIn.add("Error", (syntaxTree) => {
        assert(hasContainersChildren(syntaxTree));
        const element = new SimpleContainerMathMLElement(syntaxTree, "merror", this);
        console.warn("Rendering error", syntaxTree, element);
        return element;
      });
      builtIn.add("ErrorMessage", (syntaxTree) => {
        assert(hasLeavesChildren(syntaxTree));
        const element = new TextMathMLElement(syntaxTree, "merror");
        console.warn("Rendering error", syntaxTree, element);
        return element;
      });
      builtIn.add("Operator", (syntaxTree) => {
        assert(hasLeavesChildren(syntaxTree));
        return new TextMathMLElement(syntaxTree, "mo");
      });
      builtIn.add("Fraction", (syntaxTree) => {
        assert(hasContainersChildren(syntaxTree));
        return new SimpleContainerMathMLElement(syntaxTree, "mfrac", this);
      });
      builtIn.add("Root", (syntaxTree) => {
        // We have to switch the arguments here, because MathML uses the second argument as the root
        assert(hasContainersChildren(syntaxTree));
        syntaxTree.children.Containers.reverse();
        return new SimpleContainerMathMLElement(syntaxTree, "mroot", this);
      });
    }
    {
      const core = this.rendererCollection("Core");
      core.add("Variable", (syntaxTree) => {
        assert(hasLeavesChildren(syntaxTree));
        return new TextMathMLElement(syntaxTree, "mi");
      });
      core.add("RoundBrackets", (syntaxTree) => {
        assert(hasContainersChildren(syntaxTree));
        return new SimpleContainerMathMLElement(syntaxTree, "mrow", this);
      });
    }
    {
      const arithmetic = this.rendererCollection("Arithmetic");
      arithmetic.add("Number", (syntaxTree) => {
        assert(hasLeavesChildren(syntaxTree));
        return new TextMathMLElement(syntaxTree, "mn");
      });
      ["Add", "Subtract", "Multiply", "Divide"].forEach((name) => {
        arithmetic.add(name, (syntaxTree) => {
          assert(hasContainersChildren(syntaxTree));
          return new SimpleContainerMathMLElement(syntaxTree, "mrow", this);
        });
      });
    }
    {
      const collections = this.rendererCollection("Collections");
      collections.add("Tuple", (syntaxTree) => {
        assert(hasContainersChildren(syntaxTree));
        return new SimpleContainerMathMLElement(syntaxTree, "mrow", this);
      });
    }
    {
      const unsorted = this.rendererCollection("Unsorted");
      unsorted.add("Factorial", (syntaxTree) => {
        assert(hasContainersChildren(syntaxTree));
        return new SimpleContainerMathMLElement(syntaxTree, "mrow", this);
      });
    }
    {
      const string = this.rendererCollection("String");
      string.add("String", (syntaxTree) => {
        assert(hasLeavesChildren(syntaxTree));
        return new TextMathMLElement(syntaxTree, "mtext");
      });
    }
    {
      const functions = this.rendererCollection("Function");
      ["FunctionApplication"].forEach((name) => {
        functions.add(name, (syntaxTree) => {
          assert(hasContainersChildren(syntaxTree));
          return new SimpleContainerMathMLElement(syntaxTree, "mrow", this);
        });
      });
    }

    // TODO: all the others
  }

  /**
   * For setting up namespaced renderers
   */
  private rendererCollection(namePart: string) {
    const self = this;

    function addRenderer(nameFull: NodeIdentifier, renderer: (syntaxTree: SyntaxNode) => RenderedElement<MathMLElement>): void {
      let name = joinNodeIdentifier(nameFull);
      assert(!self.renderers.has(name), `Renderer for ${name} already exists`);

      if (import.meta.env.DEV) {
        self.renderers.set(name, (syntaxTree: SyntaxNode) => {
          const rendered = renderer(syntaxTree);
          rendered.getElements().forEach((v) => v.setAttribute("data-renderer-name", name));
          return rendered;
        });
      } else {
        self.renderers.set(name, renderer);
      }
    }

    function renderCollectionInternal(nameParts: string[]) {
      return {
        add: (name: string, renderer: (syntaxTree: SyntaxNode) => RenderedElement<MathMLElement>) => {
          addRenderer(nameParts.concat([name]), renderer);
        },
        rendererCollection(namePart: string) {
          return renderCollectionInternal(nameParts.concat([namePart]));
        },
      };
    }

    return renderCollectionInternal([namePart]);
  }

  canRender(nodeIdentifier: NodeIdentifier): boolean {
    return this.renderers.has(joinNodeIdentifier(nodeIdentifier));
  }

  renderAll(parsed: ParseResult): RenderResult<MathMLElement> {
    // TODO: Rendering errors is like rendering non-semantic annotations
    const element = this.render(parsed.value);
    return new MathMLRenderResult(element, parsed);
  }

  render(syntaxTree: SyntaxNode): RenderedElement<MathMLElement> {
    const renderer = this.renderers.get(joinNodeIdentifier(syntaxTree.name));
    assert(renderer, `No renderer for "${joinNodeIdentifier(syntaxTree.name)}"`);

    const element = renderer(syntaxTree);
    return element;
  }
}
