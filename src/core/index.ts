import init, {
  MathEditorBindings,
  type InputNode,
  type MinimalCaretSelection,
  type MinimalInputRowRange,
  type SyntaxNode,
  type SyntaxNodeChildren,
  type InputRow,
  type Offset,
  type RowIndices,
  type SerializedDataType,
  type AutocompleteResultsBindings,
  ParseModulesBindings,
  BoxedParseModule,
  ParseModuleCollectionBindings,
  MathParserBindings,
  ParseModulesCreator,
} from "../../aftermath-core/pkg";
import { assert } from "../utils/assert";

// Yay, top level await is neat https://v8.dev/features/top-level-await
await init();

export const ModulesCreator = new ParseModulesBindings();

// create all the modules
export const MathModules = {
  BuiltIn: ModulesCreator.get_built_in(),
  Arithmetic: ParseModulesCreator.make_arithmetic(ModulesCreator),
  Calculus: ParseModulesCreator.make_calculus(ModulesCreator),
  Collections: ParseModulesCreator.make_collections(ModulesCreator),
  Comparison: ParseModulesCreator.make_comparison(ModulesCreator),
  Function: ParseModulesCreator.make_function(ModulesCreator),
  Logic: ParseModulesCreator.make_logic(ModulesCreator),
  String: ParseModulesCreator.make_string(ModulesCreator),
};

export function makeMathParserWith(modules: BoxedParseModule[]) {
  const collection = new ParseModuleCollectionBindings(ModulesCreator);
  for (let module of modules) {
    collection.add_module(module);
  }
  return new MathParserBindings(collection);
}

export const MathEditorHelper = {
  insertAtCaret(mathEditor: MathEditorBindings, values: string[]) {
    return mathEditor.insert_at_caret(values);
  },
  paste(mathEditor: MathEditorBindings, data: string, data_type?: SerializedDataType) {
    return mathEditor.paste(data, data_type);
  },
  getCaret(mathEditor: MathEditorBindings): MinimalCaretSelection[] {
    return mathEditor.get_caret();
  },
  getAutocomplete(mathEditor: MathEditorBindings): AutocompleteResultsBindings | undefined {
    return mathEditor.get_autocomplete();
  },
  getInputTree(mathEditor: MathEditorBindings): InputRow {
    return mathEditor.get_input_tree();
  },
  getSyntaxTree(mathEditor: MathEditorBindings): SyntaxNode {
    return mathEditor.get_syntax_tree();
  },
  spliceAtRange(mathEditor: MathEditorBindings, range: MinimalInputRowRange, values: InputNode[]) {
    return mathEditor.splice_at_range(range, values);
  },
};

// TODO: Make this configurable
export const DefaultParser = makeMathParserWith([
  // MathModules.BuiltIn is already included
  MathModules.Arithmetic,
  MathModules.Calculus,
  MathModules.Collections,
  MathModules.Comparison,
  MathModules.Function,
  MathModules.Logic,
  MathModules.String,
]);

export function isInputRow(value: InputRow | InputNode | (InputRow | InputNode)[]): value is InputRow {
  if (!Array.isArray(value) && "values" in value) {
    // Silly hacks to force Typescript to do its job of checking if the condition above is actually good enough
    const _v = value satisfies InputRow;
    assert(true || _v);
    return true;
  }
  return false;
}

type SyntaxNodesKeys = "NewRows" | "Children" | "Leaf";

export type SyntaxNodeWith<Extra extends SyntaxNodesKeys> = SyntaxNode & {
  children: Extract<SyntaxNodeChildren, { [key in Extra]: any }>;
};

export function hasSyntaxNodeChildren<T extends SyntaxNodesKeys>(node: SyntaxNode, childType: T): node is SyntaxNodeWith<T> {
  return childType in node.children;
}

/**
 * Be careful when using this function, you don't want an off-by-one error.
 */
export function offsetInRange(
  offset: Offset,
  range: {
    start: Offset;
    end: Offset;
  }
): boolean {
  return range.start <= offset && offset <= range.end;
}

export * from "../../aftermath-core/pkg";

/**
 * Walks down the syntax tree to find the node with the given row indices.
 */
export function getNodeWithRowIndices(node: SyntaxNode, indices: RowIndices) {
  for (let rowIndex of indices) {
    let [indexOfContainer, indexOfRow] = rowIndex;
    assert(node.range.start <= indexOfContainer && indexOfContainer < node.range.end);

    const childNode = getChildWithNewRows(node, indexOfContainer);
    let rowChildElement: SyntaxNode | undefined;
    if (hasSyntaxNodeChildren(childNode, "NewRows")) {
      rowChildElement = childNode.children.NewRows.values[indexOfRow];
    } else {
      assert(false, "Expected to find NewRows");
    }
    assert(rowChildElement, `Couldn't find row ${indexOfRow} in ${node.name}`);
    node = rowChildElement;
  }

  return node;
}

/**
 * In a syntax tree, we care about the "NewRows" children, which are the rows of a grid.
 * (e.g. Fraction, Table, etc.)
 */
function getChildWithNewRows(node: SyntaxNode, indexOfContainer: number): SyntaxNodeWith<"NewRows"> {
  // Only walk down if we're still on the same row
  if (hasSyntaxNodeChildren(node, "Children")) {
    for (let childElement of node.children.Children) {
      // If we find a better matching child, we go deeper. Notice how the end bound, aka length, is exclusive.
      if (childElement.range.start <= indexOfContainer && indexOfContainer < childElement.range.end) {
        return getChildWithNewRows(childElement, indexOfContainer);
      }
    }
  }

  assert(hasSyntaxNodeChildren(node, "NewRows"));
  return node;
}
