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
        // TODO: NFD normalization? Or should that be done in the Rust code?
        return { Symbol: v.value };
      } else {
        throw new Error("Unknown type", {
          cause: v,
        });
      }
    }),
  };
}

// TODO: Unit tests to make sure they're in sync with the Rust code
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
