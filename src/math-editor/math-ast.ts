import { assert, assertUnreachable } from "../assert";
import type { MathIR } from "./math-ir";

/*
 * MathIR with parent pointers
 */
export interface MathAst {
  mathIR: MathIR;
  parents: Map<MathIR, MathIR>;
  setChild(
    mathIR: MathIR & { type: "row" | "frac" | "root" | "under" | "over" },
    value: MathIR,
    index: number
  ): void;
  setChild(mathIR: MathIR & { type: "sup" | "sub" }, value: MathIR): void;
  setChild(
    mathIR: MathIR & { type: "table" },
    value: MathIR,
    indexA: number,
    indexB: number
  ): void;
}

/**
 * Math-ir with parent pointers. Super convenient for traversing the data structure
 */
export function MathAst(mathIR: MathIR): MathAst {
  const ast: MathAst = { mathIR, parents: new Map(), setChild };

  function setChild(
    mathIR: MathIR,
    value: MathIR,
    indexA?: number,
    indexB?: number
  ): void {
    if (mathIR.type == "row") {
      assert(indexA !== undefined);
      mathIR.values[indexA] = value;
    } else if (
      mathIR.type == "frac" ||
      mathIR.type == "root" ||
      mathIR.type == "under" ||
      mathIR.type == "over"
    ) {
      assert(indexA !== undefined);
      mathIR.values[indexA] = value;
    } else if (mathIR.type == "sup" || mathIR.type == "sub") {
      mathIR.value = value;
    } else if (
      mathIR.type == "bracket" ||
      mathIR.type == "symbol" ||
      mathIR.type == "text" ||
      mathIR.type == "error"
    ) {
      throw new Error("Illegal call to setChild");
    } else if (mathIR.type == "table") {
      assert(indexA !== undefined);
      assert(indexB !== undefined);
      mathIR.values[indexA][indexB] = value;
    } else {
      assertUnreachable(mathIR);
    }
  }

  return ast;
}
