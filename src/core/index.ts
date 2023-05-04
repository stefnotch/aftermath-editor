import init, { parse } from "../../aftermath-core/pkg/aftermath_core";
import { MathLayoutRow } from "../math-layout/math-layout";

init().then((aftermath_core) => {
  console.log(aftermath_core);
  console.log(
    parse(
      toCore({
        type: "row",
        values: [
          {
            type: "symbol",
            value: "-",
            width: 0,
          },
          {
            type: "symbol",
            value: "a",
            width: 0,
          },
          {
            type: "symbol",
            value: "*",
            width: 0,
          },
          {
            type: "symbol",
            value: "b",
            width: 0,
          },
        ],
        width: 0,
      })
    )
  );
});

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
