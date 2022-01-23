import { assert, assertUnreachable } from "../assert";
import arrayUtils from "./array-utils";
import type { MathIR, MathIRContainer, MathIRTextLeaf, MathIRRow, MathIRSymbolLeaf } from "./math-ir";

/*
 * MathIR with parent pointers. Currently not super safe, as it's possible to construct a cyclic tree (node.parent = node)
 * Or calling insertChild with a subtree that doesn't have any valid parents
 */
export interface MathAst {
  mathIR: MathIRRow;
  parents: Map<MathIR, MathIRRow | MathIRContainer | null>;

  getParent(mathIR: MathIRRow): MathIRContainer | null;
  getParent(mathIR: MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf): MathIRRow | null;
  getParent(mathIR: MathIR): MathIRRow | MathIRContainer | null;

  getParentAndIndex(mathIR: MathIRRow): {
    parent: MathIRContainer | null;
    indexInParent: number;
  };
  getParentAndIndex(mathIR: MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf): { parent: MathIRRow | null; indexInParent: number };
  getParentAndIndex(mathIR: MathIR): {
    parent: MathIRRow | MathIRContainer | null;
    indexInParent: number;
  };

  setChild(mathIR: MathIRRow, value: MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf, index: number): void;
  setChild(mathIR: MathIRContainer, value: MathIRRow, index: number): void;
  setChild(mathIR: MathIR & { type: "table" }, value: MathIRRow, indexA: number, indexB: number): void;

  removeChild(mathIR: MathIRRow, value: MathIR): void;
  insertChild(mathIR: MathIRRow, value: MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf, index: number): void;

  /**
   * Recursively sets the parents, used to set all the parent links for a newly created subtree.
   * Example: `setParents(null, [mathIR]);`
   */
  setParents(parent: MathIRRow | MathIRContainer | null, children: MathIR[]): void;
}

/**
 * Math-ir with parent pointers. Super convenient for traversing the data structure
 */
export function MathAst(mathIR: MathIRRow): MathAst {
  const ast: MathAst = {
    mathIR,
    parents: new Map(),
    getParent,
    getParentAndIndex,
    setChild,
    removeChild,
    insertChild,
    setParents,
  };

  function getParent(mathIR: MathIRRow): MathIRContainer | null;
  function getParent(mathIR: MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf): MathIRRow | null;
  function getParent(mathIR: MathIR): MathIRRow | MathIRContainer | null {
    const parent = ast.parents.get(mathIR);
    if (parent) {
      return parent;
    } else {
      return null;
    }
  }

  function getParentAndIndex(mathIR: MathIRRow): {
    parent: MathIRContainer | null;
    indexInParent: number;
  };
  function getParentAndIndex(mathIR: MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf): { parent: MathIRRow | null; indexInParent: number };
  function getParentAndIndex(mathIR: MathIR): {
    parent: MathIRRow | MathIRContainer | null;
    indexInParent: number;
  } {
    const parent = ast.parents.get(mathIR);
    if (!parent) return { parent: null, indexInParent: -1 };

    if (parent.type == "row") {
      assert(mathIR.type != "row");
      const indexInParent = parent.values.indexOf(mathIR);
      assert(indexInParent >= 0);
      return { parent, indexInParent };
    } else if (parent.type == "table") {
      assert(mathIR.type == "row");
      // We assume that tables are always rectangular
      const length = parent.values.length;
      const width = parent.values[0].length;
      for (let i = 0; i < length; i++) {
        const indexInParent = parent.values[i].indexOf(mathIR);
        if (indexInParent == -1) continue;
        const oneDimensionalIndex = i * width + indexInParent;
        return { parent, indexInParent: oneDimensionalIndex };
      }
      // Unreachable
      throw new Error("Element not found in table");
    } else {
      assert(mathIR.type == "row");
      const indexInParent = parent.values.indexOf(mathIR);
      assert(indexInParent >= 0);
      return { parent, indexInParent };
    }
  }

  function removeChild(mathIR: MathIRRow, value: MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf): void {
    assert(mathIR.type == "row");
    // Maybe check if it actually returned true
    arrayUtils.remove(mathIR.values, value);
    ast.parents.delete(value);
  }

  function insertChild(mathIR: MathIRRow, value: MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf, index: number): void {
    assert(mathIR.type == "row");
    mathIR.values.splice(index, 0, value);
    ast.parents.set(value, mathIR);
  }

  function setChild(mathIR: MathIR, value: MathIR, indexA: number, indexB?: number): void {
    if (mathIR.type == "row") {
      assert(indexA !== undefined);
      assert(value.type != "row");
      mathIR.values[indexA] = value;
      ast.parents.set(value, mathIR);
    } else if (
      mathIR.type == "frac" ||
      mathIR.type == "root" ||
      mathIR.type == "under" ||
      mathIR.type == "over" ||
      mathIR.type == "sup" ||
      mathIR.type == "sub"
    ) {
      assert(indexA !== undefined);
      assert(value.type == "row");
      mathIR.values[indexA] = value;
      ast.parents.set(value, mathIR);
    } else if (mathIR.type == "bracket" || mathIR.type == "symbol" || mathIR.type == "text" || mathIR.type == "error") {
      throw new Error("Illegal call to setChild");
    } else if (mathIR.type == "table") {
      assert(indexA !== undefined);
      assert(indexB !== undefined);
      assert(value.type == "row");
      mathIR.values[indexA][indexB] = value;
      ast.parents.set(value, mathIR);
    } else {
      assertUnreachable(mathIR);
    }
  }

  function setParents(parent: MathIRRow | MathIRContainer | null, children: MathIR[]) {
    for (let i = 0; i < children.length; i++) {
      ast.parents.set(children[i], parent);

      const validParent = asRowOrContainer(children[i]);
      if (validParent != null) {
        setParents(validParent, getChildren(children[i]));
      }
    }
  }

  function asRowOrContainer(mathIR: MathIR): MathIRRow | MathIRContainer | null {
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
    if (
      mathIR.type == "row" ||
      mathIR.type == "frac" ||
      mathIR.type == "root" ||
      mathIR.type == "under" ||
      mathIR.type == "over" ||
      mathIR.type == "sup" ||
      mathIR.type == "sub"
    ) {
      return mathIR.values;
    } else if (mathIR.type == "table") {
      return mathIR.values.flatMap((v) => v);
    } else {
      return [];
    }
  }

  setParents(null, [mathIR]);

  return ast;
}
