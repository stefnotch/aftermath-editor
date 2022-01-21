import { assert, assertUnreachable } from "../assert";
import type {
  MathIR,
  MathIRContainer,
  MathIRTextLeaf,
  MathIRRow,
  MathIRSymbolLeaf,
} from "./math-ir";
import { isMathIRContainer } from "./math-ir-utils";

/*
 * MathIR with parent pointers
 */
export interface MathAst {
  mathIR: MathIRRow;
  parents: Map<MathIR, MathIRRow | MathIRContainer | null>;
  setChild(
    mathIR: MathIRRow,
    value: MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf,
    index: number
  ): void;
  setChild(mathIR: MathIRContainer, value: MathIRRow, index: number): void;
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
    } else if (mathIR.type == "table") {
      assert(indexA !== undefined);
      assert(indexB !== undefined);
      assert(value.type == "row");
      mathIR.values[indexA][indexB] = value;
    } else if (isMathIRContainer(mathIR)) {
      assert(indexA !== undefined);
      assert(value.type == "row");
      mathIR.values[indexA] = value;
    } else if (
      mathIR.type == "bracket" ||
      mathIR.type == "symbol" ||
      mathIR.type == "text" ||
      mathIR.type == "error"
    ) {
      throw new Error("Illegal call to setChild");
    } else {
      assertUnreachable(mathIR);
    }
  }

  function setParents(
    parent: MathIRRow | MathIRContainer | null,
    children: MathIR[]
  ) {
    for (let i = 0; i < children.length; i++) {
      ast.parents.set(children[i], parent);

      const validParent = asRowOrContainer(children[i]);
      if (validParent != null) {
        setParents(validParent, getChildren(children[i]));
      }
    }
  }

  function asRowOrContainer(
    mathIR: MathIR
  ): MathIRRow | MathIRContainer | null {
    if (mathIR.type == "row") {
      return mathIR;
    } else if (
      mathIR.type == "frac" ||
      mathIR.type == "root" ||
      mathIR.type == "under" ||
      mathIR.type == "over" ||
      mathIR.type == "sup" ||
      mathIR.type == "sub" ||
      mathIR.type == "table"
    ) {
      return mathIR;
    } else {
      return null;
    }
  }

  function getChildren(mathIR: MathIR) {
    if (mathIR.type == "table") {
      return mathIR.values.flatMap((v) => v);
    } else if (isMathIRContainer(mathIR)) {
      return mathIR.values;
    } else {
      return [];
    }
  }

  setParents(null, [mathIR]);

  return ast;
}
