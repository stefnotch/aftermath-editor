import init, { MathParser } from "../../aftermath-core/pkg";
import { type InputNode, InputNodeContainer, InputNodeSymbol } from "../input-tree/input-node";
import type { Offset } from "../input-tree/input-offset";
import { RowIndices } from "../input-tree/row-indices";
import { Grid, InputRow } from "../input-tree/row";
import { assert } from "../utils/assert";
import { InputRowRange } from "../input-position/input-row-range";
import type { InputRowPosition } from "../input-position/input-row-position";

// Yay, top level await is neat https://v8.dev/features/top-level-await
await init();

const parser = MathParser.new();

export function parse(row: InputRow): ParseResult {
  let result: ParseResult = parser.parse(toCore(row));

  return result;
}

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

export function getNodeIdentifiers(): Array<NodeIdentifier> {
  return parser.get_token_names();
}

// TODO: I want tuples and records for this https://github.com/tc39/proposal-record-tuple
export type NodeIdentifier = string[];
export type NodeIdentifierJoined = string;
export function joinNodeIdentifier(nodeIdentifier: NodeIdentifier): NodeIdentifierJoined {
  return nodeIdentifier.join("::");
}

function toCore(row: InputRow): CoreRow {
  const values = row.values.map((v) => toCoreNode(v));
  return { values, offset_count: row.offsetCount };
}

function toCoreNode(node: InputNode): CoreElement {
  if (node instanceof InputNodeContainer) {
    return {
      Container: {
        container_type: node.containerType,
        rows: { values: node.rows.values.map((row) => toCore(row)), width: node.rows.width },
        offset_count: node.offsetCount,
      },
    };
  } else {
    const value = node.symbol.normalize("NFD");
    return { Symbol: value };
  }
  // Uh oh, now I'm also maintaining invariants in two places.
}

function fromCore(row: CoreRow): InputRow {
  const values = row.values.map((v) => fromCoreNode(v));
  return new InputRow(values);
}

function fromCoreNode(node: CoreElement): InputNode {
  if ("Container" in node) {
    const container = node.Container;
    const rows = container.rows.values.map((row) => fromCore(row));
    return new InputNodeContainer(container.container_type, Grid.fromOneDimensional(rows, container.rows.width));
  } else {
    return new InputNodeSymbol(node.Symbol);
  }
}

// TODO:
// We're maintaining the types by hand for now, since we tried out mostly everything else.
// Directly using WASM-bindgen's Typescript stuff doesn't work, because they don't support enums. https://github.com/rustwasm/wasm-bindgen/issues/2407
// https://github.com/cloudflare/serde-wasm-bindgen/issues/19 doesn't generate Typescript types.
// tsify hasn't been updated in a while https://github.com/madonoharu/tsify/issues/17
// typeshare is only for JSON https://github.com/1Password/typeshare/issues/100 and is annoying to use (needs a CLI and such).
//
// Maybe in the future we can move to WebAssembly Interface Types, e.g. https://github.com/tauri-apps/tauri-bindgen

type CoreRow = { values: CoreElement[]; offset_count: number };
type CoreElement =
  | {
      Container: {
        container_type: CoreContainer;
        rows: CoreGrid<CoreRow>;
        offset_count: number;
      };
    }
  | { Symbol: string };

type CoreContainer = "Fraction" | "Root" | "Under" | "Over" | "Sup" | "Sub" | "Table";

type CoreGrid<T> = { values: T[]; width: number };

export type ParseResult = {
  value: SyntaxNode;
  errors: ParseError[];
};

export type SyntaxNodes =
  | {
      Containers: SyntaxNode[];
    }
  | {
      NewRows: CoreGrid<SyntaxNode>;
    }
  | {
      Leaf: SyntaxLeafNode;
    };

type SyntaxNodesKeys = "Containers" | "NewRows" | "Leaf";
type SyntaxNodesMatcher<T extends SyntaxNodesKeys> = {
  [X in T]: Extract<SyntaxNodes, { [P in X]: any }>;
}[T];

export type Range<T> = {
  start: T;
  end: T;
};

export type SyntaxNode<T extends SyntaxNodesKeys = SyntaxNodesKeys> = {
  name: NodeIdentifier;
  children: SyntaxNodesMatcher<T>;
  value: any; // TODO:
  range: Range<number>;
};

export type SyntaxLeafNode = {
  node_type: "Operator" | "Leaf";
  range: Range<number>;
  symbols: string[];
};

// TODO:
export type ParseError = {
  error: any;
  range: any;
};

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

export function hasSyntaxNodeChildren<T extends SyntaxNodesKeys>(node: SyntaxNode, childType: T): node is SyntaxNode<T> {
  return childType in node.children;
}

/**
 * Be careful when using this function, you don't want an off-by-one error.
 */
export function offsetInRange(offset: Offset, range: Range<number>): boolean {
  return range.start <= offset && offset <= range.end;
}

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
