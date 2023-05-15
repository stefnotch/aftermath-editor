import init, { MathParser } from "../../aftermath-core/pkg";
import { MathLayoutRow } from "../math-layout/math-layout";
import { Offset } from "../math-layout/math-layout-offset";

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
  return {
    values: row.values.map((v) => {
      if (v.type === "fraction") {
        return { Fraction: [toCore(v.values[0]), toCore(v.values[1])] };
      } else if (v.type === "root") {
        return { Root: [toCore(v.values[0]), toCore(v.values[1])] };
      } else if (v.type === "under") {
        return { Under: [toCore(v.values[0]), toCore(v.values[1])] };
      } else if (v.type === "over") {
        return { Over: [toCore(v.values[0]), toCore(v.values[1])] };
      } else if (v.type === "sup") {
        return { Sup: toCore(v.values[0]) };
      } else if (v.type === "sub") {
        return { Sub: toCore(v.values[0]) };
      } else if (v.type === "table") {
        return {
          Table: {
            cells: v.values.map((row) => toCore(row)),
            row_width: v.rowWidth,
          },
        };
      } else if (v.type === "symbol") {
        const value = v.value.normalize("NFD");
        return { Symbol: value };
      } else {
        throw new Error("Unknown type", {
          cause: v,
        });
      }
    }),
  };
}

// TODO:
// We're maintaining the types by hand for now, since we tried out mostly everything else.
// Directly using WASM-bindgen's Typescript stuff doesn't work, because they don't support enums. https://github.com/rustwasm/wasm-bindgen/issues/2407
// https://github.com/cloudflare/serde-wasm-bindgen/issues/19 doesn't generate Typescript types.
// tsify hasn't been updated in a while https://github.com/madonoharu/tsify/issues/17
// typeshare is only for JSON https://github.com/1Password/typeshare/issues/100 and is annoying to use (needs a CLI and such).
//
// Maybe in the future we can move to WebAssembly Interface Types, e.g. https://github.com/tauri-apps/tauri-bindgen

type CoreRow = { values: CoreElement[] };
type CoreElement =
  | { Fraction: [CoreRow, CoreRow] }
  | { Root: [CoreRow, CoreRow] }
  | { Under: [CoreRow, CoreRow] }
  | { Over: [CoreRow, CoreRow] }
  | { Sup: CoreRow }
  | { Sub: CoreRow }
  | { Table: { cells: CoreRow[]; row_width: number } }
  | { Symbol: string };

export type ParseResult = {
  value: SyntaxNode;
  errors: ParseError[];
};

export type SyntaxNodes =
  | {
      Containers: SyntaxNode[];
    }
  | {
      Leaves: SyntaxLeafNode[];
    };

export type Range<T> = {
  start: T;
  end: T;
};

export type SyntaxNode<T extends SyntaxNodes = SyntaxNodes> = {
  name: string[];
  children: T;
  row_index?: [bigint, bigint];
  value: any; // TODO:
  range: Range<bigint>;
};

export type SyntaxLeafNode = {
  node_type: "Operator" | "Leaf";
  range: Range<bigint>;
  symbols: string[];
};

// TODO:
export type ParseError = {
  error: any;
  range: any;
};

export function hasContainersChildren(node: SyntaxNode): node is SyntaxNode<{ Containers: SyntaxNode[] }> {
  return "Containers" in node.children;
}
export function hasLeavesChildren(node: SyntaxNode): node is SyntaxNode<{ Leaves: SyntaxLeafNode[] }> {
  return "Leaves" in node.children;
}

export function offsetInRange(offset: Offset, range: Range<bigint>): boolean {
  return range.start <= offset && offset <= range.end;
}
