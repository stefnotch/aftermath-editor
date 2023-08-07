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
  type Offset2D,
} from "../../aftermath-core/pkg";
import { assert } from "../utils/assert";

// Yay, top level await is neat https://v8.dev/features/top-level-await
await init();

export const MathEditorHelper = {
  getSyntaxTree(mathEditor: MathEditorBindings): SyntaxNode {
    return mathEditor.get_syntax_tree();
  },
  insertAtCaret(mathEditor: MathEditorBindings, values: string[]) {
    return mathEditor.insert_at_caret(values);
  },
  getCaret(mathEditor: MathEditorBindings): MinimalCaretSelection[] {
    return mathEditor.get_caret();
  },
  spliceAtRange(mathEditor: MathEditorBindings, range: MinimalInputRowRange, values: InputNode[]) {
    return mathEditor.splice_at_range(range, values);
  },
  getTokenNames(mathEditor: MathEditorBindings): NodeIdentifier[] {
    return mathEditor.get_token_names();
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

export type ParseResult = {
  value: SyntaxNode;
  errors: any[];
};

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

export type Autocomplete = {
  input: InputRowRange;
  result: AutocompleteResult;
};

export type AutocompleteResult = {
  potentialRules: AutocompleteRuleMatch[];
};

export type AutocompleteRuleMatch = {
  value: string;
  result: InputNode[];
  matchLength: number;
};

export function autocomplete(tokenStarts: InputRowPosition[], endPosition: Offset): Autocomplete[] {
  return tokenStarts.flatMap((token) => {
    let inputNodes = token.zipper.value.values.slice(token.offset, endPosition);
    let result: CoreAutocompleteResult | null = parser.autocomplete(inputNodes.map((n) => toCoreNode(n))) ?? null;
    if (result !== null) {
      let autocomplete: Autocomplete = {
        input: new InputRowRange(token.zipper, token.offset, endPosition),
        result: fromCoreAutocompleteResult(result),
      };
      return [autocomplete];
    } else {
      return [];
    }
  });
}

export function beginningAutocomplete(token: InputRowPosition, endPosition: Offset): Autocomplete | null {
  let inputNodes = token.zipper.value.values.slice(token.offset, endPosition);
  let result: CoreAutocompleteResult | null = parser.beginning_autocomplete(inputNodes.map((n) => toCoreNode(n))) ?? null;
  if (result !== null) {
    let autocomplete: Autocomplete = {
      input: new InputRowRange(token.zipper, token.offset, endPosition),
      result: fromCoreAutocompleteResult(result),
    };
    return autocomplete;
  } else {
    return null;
  }
}

function fromCoreAutocompleteResult(result: CoreAutocompleteResult): AutocompleteResult {
  return {
    potentialRules: result.potential_rules.map((r) => {
      return {
        value: r.rule.value,
        result: r.rule.result.map((e) => fromCoreNode(e)),
        matchLength: r.match_length,
      };
    }),
  };
}

// TODO: I want tuples and records for this https://github.com/tc39/proposal-record-tuple
export type NodeIdentifierJoined = string;
export function joinNodeIdentifier(nodeIdentifier: NodeIdentifier): NodeIdentifierJoined {
  return nodeIdentifier.join("::");
}

// TODO:
// We're maintaining the types by hand for now, since we tried out mostly everything else.
// Directly using WASM-bindgen's Typescript stuff doesn't work, because they don't support enums. https://github.com/rustwasm/wasm-bindgen/issues/2407
// https://github.com/cloudflare/serde-wasm-bindgen/issues/19 doesn't generate Typescript types.
// typeshare is only for JSON https://github.com/1Password/typeshare/issues/100 and is annoying to use (needs a CLI and such).
//
// Maybe in the future we can move to WebAssembly Interface Types, e.g. https://github.com/tauri-apps/tauri-bindgen

type CoreAutocompleteResult = {
  range_in_input: Range<number>;
  potential_rules: CoreAutocompleteRuleMatch[];
};

type CoreAutocompleteRuleMatch = {
  rule: CoreAutocompleteRule;
  match_length: number;
};

type CoreAutocompleteRule = {
  result: CoreElement[];
  value: string;
};

export function getRowNode(node: SyntaxNode, indices: RowIndices) {
  // Note that similar code exists in render-result.ts
  for (let rowIndex of indices) {
    let [indexOfContainer, indexOfRow] = rowIndex;
    assert(node.range.start <= indexOfContainer && indexOfContainer < node.range.end);

    const childNode = getChildWithContainerIndex(node, indexOfContainer);
    let rowChildElement: SyntaxNode | undefined;
    if (hasSyntaxNodeChildren(childNode, "NewRows")) {
      rowChildElement = childNode.children.NewRows.values[indexOfRow];
    } else {
      assert(false, "Expected to find NewRows");
    }
    assert(rowChildElement, `Couldn't find row ${indexOfRow} in ${joinNodeIdentifier(node.name)}`);
    node = rowChildElement;
  }

  function getChildWithContainerIndex(node: SyntaxNode, indexOfContainer: number): SyntaxNode<"NewRows"> {
    // Only walk down if we're still on the same row
    if (hasSyntaxNodeChildren(node, "Containers")) {
      for (let childElement of node.children.Containers) {
        // If we find a better matching child, we go deeper. Notice how the end bound, aka length, is exclusive.
        if (childElement.range.start <= indexOfContainer && indexOfContainer < childElement.range.end) {
          return getChildWithContainerIndex(childElement, indexOfContainer);
        }
      }
    }

    assert(hasSyntaxNodeChildren(node, "NewRows"));
    return node;
  }

  return node;
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
