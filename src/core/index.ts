import init, {
  MathEditorBindings,
  type InputNode,
  type MinimalCaretSelection,
  type MinimalInputRowRange,
  type NodeIdentifier,
  type SyntaxNode,
  type SyntaxNodeChildren,
  type InputRow,
  type Offset,
  type RowIndices,
  type SerializedDataType,
  type AutocompleteResultsBindings,
} from "../../aftermath-core/pkg";
import { assert } from "../utils/assert";

// Yay, top level await is neat https://v8.dev/features/top-level-await
await init();

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
  getRuleNames(mathEditor: MathEditorBindings): NodeIdentifier[] {
    return mathEditor.get_rule_names();
  },
};

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

// TODO: I want tuples and records for this https://github.com/tc39/proposal-record-tuple
export type NodeIdentifierJoined = string;
export function joinNodeIdentifier(nodeIdentifier: NodeIdentifier): NodeIdentifierJoined {
  return nodeIdentifier.join("::");
}

export function getGridRow(node: SyntaxNode, indices: RowIndices, indexOfContainer: number, gridOffset: Offset2D): RowIndices {
  node = getNodeWithRowIndices(node, indices);
  const gridNode = getChildWithNewRows(node, indexOfContainer);

  const indexInGrid = gridOffset.x + gridOffset.y * gridNode.children.NewRows.width;
  return [...indices, [indexOfContainer, indexInGrid]];
}

function getNodeWithRowIndices(node: SyntaxNode, indices: RowIndices) {
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
    assert(rowChildElement, `Couldn't find row ${indexOfRow} in ${joinNodeIdentifier(node.name)}`);
    node = rowChildElement;
  }

  return node;
}

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
