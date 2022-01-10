import { assert, assertUnreachable } from "../assert";
import type {
  MathIR,
  MathIRContainer,
  MathIRTextLeaf,
  MathIRRow,
  MathIRSymbolLeaf,
} from "./math-ir";

/*
 * MathIR with parent pointers
 */
export interface MathAst {
  mathIR: MathIRRow;
  parents: Map<MathIR, MathIR | null>;
  setChild(
    mathIR: MathIRRow,
    value: MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf,
    index: number
  ): void;
  setChild(
    mathIR: MathIR & { type: "frac" | "root" | "under" | "over" },
    value: MathIRRow,
    index: number
  ): void;
  setChild(mathIR: MathIR & { type: "sup" | "sub" }, value: MathIR): void;
  setChild(
    mathIR: MathIR & { type: "table" },
    value: MathIRRow,
    indexA: number,
    indexB: number
  ): void;
}

/**
 * Math-ir with parent pointers. Super convenient for traversing the data structure
 */
export function MathAst(mathIR: MathIRRow): MathAst {
  const ast: MathAst = { mathIR, parents: new Map(), setChild };

  function setChild(
    mathIR: MathIR,
    value: MathIR,
    indexA?: number,
    indexB?: number
  ): void {
    if (mathIR.type == "row") {
      assert(indexA !== undefined);
      assert(value.type != "row");
      mathIR.values[indexA] = value;
    } else if (
      mathIR.type == "frac" ||
      mathIR.type == "root" ||
      mathIR.type == "under" ||
      mathIR.type == "over"
    ) {
      assert(indexA !== undefined);
      assert(value.type == "row");
      mathIR.values[indexA] = value;
    } else if (mathIR.type == "sup" || mathIR.type == "sub") {
      assert(value.type == "row");
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
      assert(value.type == "row");
      mathIR.values[indexA][indexB] = value;
    } else {
      assertUnreachable(mathIR);
    }
  }

  function setParents(parent: MathIR | null, children: MathIR[]) {
    for (let i = 0; i < children.length; i++) {
      ast.parents.set(children[i], parent);
      setParents(children[i], getChildren(children[i]));
    }
  }

  function getChildren(mathIR: MathIR) {
    if (
      mathIR.type == "row" ||
      mathIR.type == "frac" ||
      mathIR.type == "root" ||
      mathIR.type == "under" ||
      mathIR.type == "over"
    ) {
      return mathIR.values;
    } else if (mathIR.type == "sup" || mathIR.type == "sub") {
      return [mathIR.value];
    } else if (mathIR.type == "table") {
      return mathIR.values.flatMap((v) => v);
    } else {
      return [];
    }
  }

  setParents(null, [mathIR]);

  return ast;
}
