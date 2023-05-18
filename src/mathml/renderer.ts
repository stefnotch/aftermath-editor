import {
  NodeIdentifier,
  NodeIdentifierJoined,
  ParseResult,
  SyntaxNode,
  hasSyntaxNodeChildren,
  joinNodeIdentifier,
} from "../core";
import { RowIndex } from "../math-layout/math-layout-zipper";
import { RenderedElement, RenderResult, Renderer } from "../rendering/render-result";
import { assert } from "../utils/assert";
import { MathMLRenderResult } from "./render-result";
import { SimpleContainerMathMLElement } from "./renderer/rendered-container-element";
import { NothingMathMLElement } from "./renderer/rendered-nothing";
import { RowsContainerMathMLElement } from "./renderer/rendered-rows-element";
import { SymbolMathMLElement } from "./renderer/rendered-symbol-element";
import { TextMathMLElement } from "./renderer/rendered-text-element";

export class MathMLRenderer implements Renderer<MathMLElement> {
  private readonly renderers: Map<
    NodeIdentifierJoined,
    (syntaxTree: SyntaxNode, rowIndex: RowIndex | null) => RenderedElement<MathMLElement>
  > = new Map();

  constructor() {
    // TODO:
    // Maybe detect under-over?
    // If it's a square root, make the 2 a bit lighter?
    // Bracket pairing (we already get enough info from the syntax tree!)
    // element.setAttribute("stretchy", "false"); when rendering brackets
    // sub, sup without a base element - create a placeholder
    // look at https://w3c.github.io/mathml-core/#operator-tables

    // TODO:
    // under, over, underover, sub, sup, subsup
    // table
    /*
if (mathIR.type === "table") {
    const width = mathIR.rowWidth;
    const rows: MathLayoutRow[][] = [];
    const childTranslators: RowDomTranslator[] = [];
    // copy rows from mathIR.values into rows
    for (let i = 0; i < mathIR.values.length; i += width) {
      rows.push(mathIR.values.slice(i, i + width));
    }
    const element = createMathElement(
      "mtable",
      rows.map((row) =>
        createMathElement(
          "mtr",
          row.map((cell) => {
            const cellWithElement = fromMathLayoutRow(cell);
            childTranslators.push(cellWithElement.translator);
            return createMathElement("mtd", [cellWithElement.element]);
          })
        )
      )
    );
    const translator = new MathTableDomTranslator(mathIR, element, childTranslators);
    return { element, translator };
  }
  */

    {
      const builtIn = this.rendererCollection("BuiltIn");
      builtIn.add("Nothing", (syntaxTree, rowIndex) => {
        return new NothingMathMLElement(syntaxTree, rowIndex);
      });
      builtIn.add("Error", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        const element = new SimpleContainerMathMLElement(syntaxTree, rowIndex, "merror", this);
        console.warn("Rendering error", syntaxTree, element);
        return element;
      });
      builtIn.add("ErrorMessage", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaves"));
        const element = new TextMathMLElement(syntaxTree, rowIndex, "merror");
        console.warn("Rendering error", syntaxTree, element);
        return element;
      });
      builtIn.add("Operator", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaves"));
        return new SymbolMathMLElement(syntaxTree, rowIndex, "mo");
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
        // We have to switch the arguments here, because MathML uses the second argument as the root
        assert(hasSyntaxNodeChildren(syntaxTree, "NewRows"));
        syntaxTree.children.NewRows.reverse();
        return new RowsContainerMathMLElement(syntaxTree, rowIndex, "mroot", this);
      });

      // TODO: Table
    }
    {
      const core = this.rendererCollection("Core");
      core.add("Variable", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaves"));
        return new TextMathMLElement(syntaxTree, rowIndex, "mi");
      });
      core.add("RoundBrackets", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
        return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
      });
    }
    {
      const arithmetic = this.rendererCollection("Arithmetic");
      arithmetic.add("Number", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaves"));
        return new TextMathMLElement(syntaxTree, rowIndex, "mn");
      });
      ["Add", "Subtract", "Multiply", "Divide"].forEach((name) => {
        arithmetic.add(name, (syntaxTree, rowIndex) => {
          assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
          return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
        });
      });
    }
    {
      const collections = this.rendererCollection("Collections");
      collections.add("Tuple", (syntaxTree, rowIndex) => {
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
      const string = this.rendererCollection("String");
      string.add("String", (syntaxTree, rowIndex) => {
        assert(hasSyntaxNodeChildren(syntaxTree, "Leaves"));
        return new TextMathMLElement(syntaxTree, rowIndex, "mtext");
      });
    }
    {
      const functions = this.rendererCollection("Function");
      ["FunctionApplication"].forEach((name) => {
        functions.add(name, (syntaxTree, rowIndex) => {
          assert(hasSyntaxNodeChildren(syntaxTree, "Containers"));
          return new SimpleContainerMathMLElement(syntaxTree, rowIndex, "mrow", this);
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

    function addRenderer(
      nameFull: NodeIdentifier,
      renderer: (syntaxTree: SyntaxNode, rowIndex: RowIndex | null) => RenderedElement<MathMLElement>
    ): void {
      let name = joinNodeIdentifier(nameFull);
      assert(!self.renderers.has(name), `Renderer for ${name} already exists`);

      if (import.meta.env.DEV) {
        self.renderers.set(name, (syntaxTree, rowIndex) => {
          const rendered = renderer(syntaxTree, rowIndex);
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
          name: string,
          renderer: (syntaxTree: SyntaxNode, rowIndex: RowIndex | null) => RenderedElement<MathMLElement>
        ) => {
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
    const element = this.render(parsed.value, null);
    return new MathMLRenderResult(element, parsed);
  }

  render(syntaxTree: SyntaxNode, rowIndex: RowIndex | null): RenderedElement<MathMLElement> {
    const renderer = this.renderers.get(joinNodeIdentifier(syntaxTree.name));
    assert(renderer, `No renderer for "${joinNodeIdentifier(syntaxTree.name)}"`);

    const element = renderer(syntaxTree, rowIndex);
    return element;
  }
}
