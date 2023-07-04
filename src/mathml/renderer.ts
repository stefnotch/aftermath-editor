import {
  type NodeIdentifier,
  type NodeIdentifierJoined,
  type ParseResult,
  type SyntaxNode,
  hasSyntaxNodeChildren,
  joinNodeIdentifier,
} from "../core";
import type { RowIndex } from "../input-tree/row-indices";
import type { RenderedElement, RenderResult, Renderer, ImmediateRenderingOptions } from "../rendering/render-result";
import { assert } from "../utils/assert";
import { MathMLRenderResult } from "./render-result";
import { SimpleContainerMathMLElement } from "./renderer/rendered-container-element";
import { MissingMathMLElement } from "./renderer/rendered-missing";
import { NothingMathMLElement } from "./renderer/rendered-nothing";
import { RootMathMLElement } from "./renderer/rendered-root-element";
import { RowsContainerMathMLElement } from "./renderer/rendered-rows-element";
import { SymbolMathMLElement } from "./renderer/rendered-symbol-element";
import { TableMathMLElement } from "./renderer/rendered-table-element";
import { TextMathMLElement } from "./renderer/rendered-text-element";

export class MathMLRenderer implements Renderer<MathMLElement> {
  private readonly renderers: Map<
    NodeIdentifierJoined,
    (
      syntaxTree: SyntaxNode,
      rowIndex: RowIndex | null,
      options: Partial<ImmediateRenderingOptions>
    ) => RenderedElement<MathMLElement>
  > = new Map();

  constructor() {
    // TODO:
    // If it's a square root, make the 2 a bit lighter?
    // sub, sup without a base element - create a placeholder
    // look at https://w3c.github.io/mathml-core/#operator-tables

    {
      const builtIn = this.rendererCollection("BuiltIn");
      builtIn.add("Nothing", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new NothingMathMLElement(syntaxTree, rowIndex);
      });
      builtIn.add("ErrorContainer", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
      builtIn.add("ErrorUnknownToken", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaf"));
        return new SymbolMathMLElement(syntaxTree, rowIndex, "merror");
      });
      builtIn.add("ErrorMissingToken", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new MissingMathMLElement(syntaxTree, rowIndex);
      });
      builtIn.add("Operator", (syntaxTree, rowIndex, options) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaf"));
        return new SymbolMathMLElement(syntaxTree, rowIndex, "mo", {
          isStretchy: options.stretchyOperators ?? false,
        });
      });
      builtIn.add("Fraction", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "NewRows"));
        return new RowsContainerMathMLElement(syntaxTree, rowIndex, "mfrac", this);
      });
      builtIn.add("Under", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "NewRows"));
        return new RowsContainerMathMLElement(syntaxTree, rowIndex, "munder", this);
      });
      builtIn.add("Over", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "NewRows"));
        return new RowsContainerMathMLElement(syntaxTree, rowIndex, "mover", this);
      });
      builtIn.add("Sup", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "msup", this);
      });
      builtIn.add("Sub", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "msub", this);
      });
      builtIn.add("Row", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "NewRows"));
        return new RowsContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
      builtIn.add("Root", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "NewRows"));
        return new RootMathMLElement(syntaxTree, rowIndex, "mroot", this);
      });
      builtIn.add("Table", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "NewRows"));
        return new TableMathMLElement(syntaxTree, rowIndex, this);
      });
    }
    {
      const core = this.rendererCollection("Core");
      core.add("Variable", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaf"));
        return new TextMathMLElement(syntaxTree, rowIndex, "mi");
      });
      core.add("RoundBrackets", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this, { stretchyOperators: true });
      });
      core.add("Subscript", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
    }
    {
      const arithmetic = this.rendererCollection("Arithmetic");
      arithmetic.add("Number", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaf"));
        return new TextMathMLElement(syntaxTree, rowIndex, "mn");
      });
      arithmetic.add(["Add", "Subtract", "Multiply", "Divide", "Exponent"], (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
    }
    {
      const calculus = this.rendererCollection("Calculus");
      calculus.add(["Infinity", "Lim", "LimSup", "LimInf"], (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaf"));
        return new TextMathMLElement(syntaxTree, rowIndex, "mi");
      });
    }
    {
      const comparison = this.rendererCollection("Comparison");
      comparison.add(
        ["Equals", "GreaterThan", "LessThan", "GreaterThanOrEquals", "LessThanOrEquals"],
        (syntaxTree, rowIndex) => {
          assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
          return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
        }
      );
    }
    {
      const collection = this.rendererCollection("Collection");
      collection.add("Tuple", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
    }
    {
      const unsorted = this.rendererCollection("Unsorted");
      unsorted.add("Factorial", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
    }
    {
      const functions = this.rendererCollection("Function");
      functions.add("FunctionApplication", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
    }
    {
      const string = this.rendererCollection("String");
      string.add("String", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaf"));
        return new TextMathMLElement(syntaxTree, rowIndex, "mtext");
      });
    }
    {
      const logic = this.rendererCollection("Logic");
      logic.add(["True", "False"], (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaf"));
        return new TextMathMLElement(syntaxTree, rowIndex, "mi");
      });
      logic.add(["And", "Or", "Not", "Equivalent", "Implies"], (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
    }
  }

  /**
   * For setting up namespaced renderers
   */
  private rendererCollection(namePart: string) {
    const self = this;

    function addRenderer(
      nameFull: NodeIdentifier,
      renderer: (
        syntaxTree: SyntaxNode,
        rowIndex: RowIndex | null,
        options: Partial<ImmediateRenderingOptions>
      ) => RenderedElement<MathMLElement>
    ): void {
      let name = joinNodeIdentifier(nameFull);
      assert(!self.renderers.has(name), `Renderer for ${name} already exists`);

      if (import.meta.env.DEV) {
        self.renderers.set(name, (syntaxTree, rowIndex, options) => {
          const rendered = renderer(syntaxTree, rowIndex, options);
          rendered.getElements().forEach((v) => {
            v.setAttribute("data-renderer-name", name);
          });
          return rendered;
        });
      } else {
        self.renderers.set(name, renderer);
      }
    }

    function renderCollectionInternal(nameParts: string[]) {
      return {
        add: (
          names: string | string[],
          renderer: (
            syntaxTree: SyntaxNode,
            rowIndex: RowIndex | null,
            options: Partial<ImmediateRenderingOptions>
          ) => RenderedElement<MathMLElement>
        ) => {
          if (typeof names === "string") {
            names = [names];
          }
          names.forEach((name) => {
            addRenderer(nameParts.concat([name]), renderer);
          });
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
    const element = this.render(parsed.value, null);
    return new MathMLRenderResult(element);
  }

  render(
    syntaxTree: SyntaxNode,
    rowIndex: RowIndex | null,
    options: Partial<ImmediateRenderingOptions> = {}
  ): RenderedElement<MathMLElement> {
    const renderer = this.renderers.get(joinNodeIdentifier(syntaxTree.name));
    assert(renderer, `No renderer for "${joinNodeIdentifier(syntaxTree.name)}"`);

    const element = renderer(syntaxTree, rowIndex, options);
    return element;
  }
}
