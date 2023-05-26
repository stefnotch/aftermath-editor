import init, { MathParser } from "../../aftermath-core/pkg";
import { MathLayoutRow } from "../math-layout/math-layout";
import { Offset } from "../math-layout/math-layout-offset";
import { RowIndex, RowIndices } from "../math-layout/math-layout-zipper";
import { assert } from "../utils/assert";
import { customError } from "../utils/error-utils";

// Yay, top level await is neat https://v8.dev/features/top-level-await
await init();

const parser = MathParser.new();

export function parse(row: MathLayoutRow): ParseResult {
  let result: ParseResult = parser.parse(toCore(row));

  return result;
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

function toCore(row: MathLayoutRow): CoreRow {
  const values: CoreElement[] = row.values.map((v) => {
    // Uh oh, now I'm also maintaining invariants in two places.
    if (v.type === "fraction") {
      return {
        Container: {
          container_type: "Fraction",
          rows: { values: [toCore(v.values[0]), toCore(v.values[1])], width: 1 },
          offset_count: v.offsetCount,
        },
      };
    } else if (v.type === "root") {
      return {
        Container: {
          container_type: "Root",
          rows: { values: [toCore(v.values[0]), toCore(v.values[1])], width: 2 },
          offset_count: v.offsetCount,
        },
      };
    } else if (v.type === "under") {
      return {
        Container: {
          container_type: "Under",
          rows: { values: [toCore(v.values[0]), toCore(v.values[1])], width: 1 },
          offset_count: v.offsetCount,
        },
      };
    } else if (v.type === "over") {
      return {
        Container: {
          container_type: "Over",
          rows: { values: [toCore(v.values[0]), toCore(v.values[1])], width: 1 },
          offset_count: v.offsetCount,
        },
      };
    } else if (v.type === "sup") {
      return {
        Container: { container_type: "Sup", rows: { values: [toCore(v.values[0])], width: 1 }, offset_count: v.offsetCount },
      };
    } else if (v.type === "sub") {
      return {
        Container: { container_type: "Sub", rows: { values: [toCore(v.values[0])], width: 1 }, offset_count: v.offsetCount },
      };
    } else if (v.type === "table") {
      return {
        Container: {
          container_type: "Table",
          rows: { values: v.values.map((row) => toCore(row)), width: v.rowWidth },
          offset_count: v.offsetCount,
        },
      };
    } else if (v.type === "symbol") {
      const value = v.value.normalize("NFD");
      return { Symbol: value };
    } else {
      throw customError("Unknown type", { type: v.type });
    }
  });

  return { values, offset_count: row.offsetCount };
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
      NewRows: [RowIndex, SyntaxNode][];
    }
  | {
      NewTable: [[RowIndex, SyntaxNode][], number];
    }
  | {
      Leaf: SyntaxLeafNode;
    };

type SyntaxNodesKeys = "Containers" | "NewRows" | "NewTable" | "Leaf";
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
      rowChildElement = childNode.children.NewRows.find(([rowIndex, _]) => rowIndex[1] === indexOfRow)?.[1];
    } else if (hasSyntaxNodeChildren(childNode, "NewTable")) {
      rowChildElement = childNode.children.NewTable[0].find(([rowIndex, _]) => rowIndex[1] === indexOfRow)?.[1];
    } else {
      assert(false, "Expected to find NewRows or NewTable");
    }
    assert(rowChildElement, `Couldn't find row ${indexOfRow} in ${joinNodeIdentifier(node.name)}`);
    node = rowChildElement;
  }

  function getChildWithContainerIndex(node: SyntaxNode, indexOfContainer: number): SyntaxNode<"NewRows" | "NewTable"> {
    // Only walk down if we're still on the same row
    if (hasSyntaxNodeChildren(node, "Containers")) {
      for (let childElement of node.children.Containers) {
        // If we find a better matching child, we go deeper. Notice how the end bound, aka length, is exclusive.
        if (childElement.range.start <= indexOfContainer && indexOfContainer < childElement.range.end) {
          return getChildWithContainerIndex(childElement, indexOfContainer);
        }
      }
    }

    assert(hasSyntaxNodeChildren(node, "NewRows") || hasSyntaxNodeChildren(node, "NewTable"));
    return node;
  }

  return node;
}
