import { type PathIdentifier, type SyntaxNode, hasSyntaxNodeChildren, type SyntaxNodeNameId } from "../core";
import type { RowIndex } from "../input-tree/row-indices";
import type {
  RenderedElement,
  RenderResult,
  Renderer,
  ImmediateRenderingOptions,
  ParseResult,
} from "../rendering/render-result";
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

export type PathIdentifierJoined = string;
export function joinPathIdentifier(path: PathIdentifier): PathIdentifierJoined {
  return path.join("::");
}

export type NameMap = ReadonlyMap<PathIdentifierJoined, SyntaxNodeNameId>;

export class MathMLRenderer implements Renderer<MathMLElement> {
  private readonly renderers: Map<
    SyntaxNodeNameId,
    (
      syntaxTree: SyntaxNode,
      rowIndex: RowIndex | null,
      options: Partial<ImmediateRenderingOptions<MathMLElement>>
    ) => RenderedElement<MathMLElement>
  > = new Map();

  private readonly nameMap: NameMap;

  constructor(nameMap: NameMap) {
    this.nameMap = nameMap;
    // TODO:
    // If it's a square root, make the 2 a bit lighter?
    // sub, sup without a base element - create a placeholder
    // look at https://w3c.github.io/mathml-core/#operator-tables

    {
      const builtIn = this.rendererCollection("BuiltIn");
      builtIn.add("Nothing", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
        return new NothingMathMLElement(syntaxTree, rowIndex);
      });
      builtIn.add("Whitespace", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaf"));
        return new TextMathMLElement(syntaxTree, rowIndex, "mspace");
      });
      builtIn.add("Whitespaces", (syntaxTree, rowIndex, options) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
        // Pass the rendering options straight through a whitespaces node
        // This is needed so that the options can actually affect the rendering of stretchy/NewRows/... operators, instead of being blocked by the whitespace node
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this, options);
      });
      builtIn.add("Operator", (syntaxTree, rowIndex, options) => {
        // There are also operators that actually have children, like sub and superscripts
        if (hasSyntaxNodeChildren(syntaxTree, "Leaf")) {
          return new SymbolMathMLElement(syntaxTree, rowIndex, "mo", {
            isStretchy: options.stretchyOperators ?? false,
          });
        } else if (hasSyntaxNodeChildren(syntaxTree, "Children")) {
          return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
        } else {
          assert(hasSyntaxNodeChildren(syntaxTree, "NewRows"));
          assert(
            options.newRowsOperatorOverride,
            "Operator has neither children nor leaf. This means that it's a NewRows operator, like a superscript. Those need have a newRowsOperatorOverride"
          );
          return options.newRowsOperatorOverride(syntaxTree, rowIndex);
        }
      });
      builtIn.add("Fraction", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "NewRows"));
        return new RowsContainerMathMLElement(syntaxTree, rowIndex, "mfrac", this);
      });
      builtIn.add("Sup", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
        assert(hasSyntaxNodeChildren(syntaxTree.children.Children[1], "NewRows"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "msup", this, {
          newRowsOperatorOverride: (node) => {
            assert(hasSyntaxNodeChildren(node, "NewRows"));
            return new RowsContainerMathMLElement(node, rowIndex, "mrow", this);
          },
        });
      });
      builtIn.add("Sub", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
        assert(hasSyntaxNodeChildren(syntaxTree.children.Children[1], "NewRows"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "msub", this, {
          newRowsOperatorOverride: (node) => {
            assert(hasSyntaxNodeChildren(node, "NewRows"));
            return new RowsContainerMathMLElement(node, rowIndex, "mrow", this);
          },
        });
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
      const error = this.rendererCollection("Error");
      error.add("MissingToken", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
        return new MissingMathMLElement(syntaxTree, rowIndex);
      });
      error.add("UnknownToken", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaf"));
        return new TextMathMLElement(syntaxTree, rowIndex, "merror");
      });
      error.add("MissingOperator", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
        // has a "missing token" child which renders the error
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
    }
    {
      const core = this.rendererCollection("Core");
      core.add("Variable", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaf"));
        return new TextMathMLElement(syntaxTree, rowIndex, "mi");
      });
      core.add("RoundBrackets", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this, { stretchyOperators: true });
      });
    }
    {
      const arithmetic = this.rendererCollection("Arithmetic");
      arithmetic.add("Number", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaf"));
        return new TextMathMLElement(syntaxTree, rowIndex, "mn");
      });
      arithmetic.add(["Add", "Subtract", "Multiply", "Divide", "Exponent", "Factorial"], (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
    }
    {
      const calculus = this.rendererCollection("Calculus");
      calculus.add(["Infinity"], (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaf"));
        return new TextMathMLElement(syntaxTree, rowIndex, "mi");
      });
      calculus.add(["Lim", "LimSup", "LimInf"], (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
      calculus.add(["Integral", "Sum"], (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
    }
    {
      const comparison = this.rendererCollection("Comparison");
      comparison.add(
        ["Equals", "GreaterThan", "LessThan", "GreaterThanOrEquals", "LessThanOrEquals"],
        (syntaxTree, rowIndex) => {
          assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
          return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
        }
      );
    }
    {
      const collection = this.rendererCollection("Collections");
      collection.add("Tuple", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
    }
    {
      const functions = this.rendererCollection("Function");
      functions.add("FunctionApplication", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
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
        assert(hasSyntaxNodeChildren(syntaxTree, "Children"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
    }

    this.nameMap.forEach((name, path) => {
      assert(this.renderers.get(name), `Renderer for ${path} (ID ${name}) is missing`);
    });
  }

  /**
   * For setting up namespaced renderers
   */
  private rendererCollection(namePart: string) {
    const self = this;

    function addRenderer(
      nameFull: PathIdentifier,
      renderer: (
        syntaxTree: SyntaxNode,
        rowIndex: RowIndex | null,
        options: Partial<ImmediateRenderingOptions<MathMLElement>>
      ) => RenderedElement<MathMLElement>
    ): void {
      let name = self.nameMap.get(joinPathIdentifier(nameFull));
      if (name === undefined) {
        console.warn(
          `${joinPathIdentifier(
            nameFull
          )} is missing a name ID, this usually happens when a renderer is defined, but the parser cannot generate it.`
        );
        return;
      }

      assert(!self.renderers.has(name), `Renderer for ${name} already exists`);

      if (import.meta.env.DEV) {
        self.renderers.set(name, (syntaxTree, rowIndex, options) => {
          const rendered = renderer(syntaxTree, rowIndex, options);
          rendered.getElements().forEach((v) => {
            v.setAttribute("data-renderer-name", joinPathIdentifier(nameFull));
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
            options: Partial<ImmediateRenderingOptions<MathMLElement>>
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

  // TODO: Rendering errors is like rendering non-semantic annotations
  renderAll(parsed: ParseResult): RenderResult<MathMLElement> {
    const element = this.render(parsed.value, null);
    return new MathMLRenderResult(element);
  }

  render(
    syntaxTree: SyntaxNode,
    rowIndex: RowIndex | null,
    options: Partial<ImmediateRenderingOptions<MathMLElement>> = {}
  ): RenderedElement<MathMLElement> {
    const renderer = this.renderers.get(syntaxTree.name);
    assert(renderer, `No renderer for "${syntaxTree.name}"`);

    const element = renderer(syntaxTree, rowIndex, options);
    return element;
  }
}
