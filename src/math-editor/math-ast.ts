import { assert, assertUnreachable } from "../assert";
import arrayUtils from "./array-utils";
import type { MathLayout, MathLayoutContainer, MathLayoutText, MathLayoutRow, MathLayoutSymbol } from "./math-layout";

/*
 * MathLayout with parent pointers. Currently not super safe, as it's possible to construct a cyclic tree (node.parent = node)
 * Or calling insertChild with a subtree that doesn't have any valid parents
 */
export interface MathAst {
  mathIR: MathLayoutRow;
  parents: Map<MathLayout, MathLayoutRow | MathLayoutContainer | null>;

  getParent(mathIR: MathLayoutRow): MathLayoutContainer | null;
  getParent(mathIR: MathLayoutContainer | MathLayoutSymbol | MathLayoutText): MathLayoutRow | null;
  getParent(mathIR: MathLayout): MathLayoutRow | MathLayoutContainer | null;

  getParentAndIndex(mathIR: MathLayoutRow): {
    parent: MathLayoutContainer | null;
    indexInParent: number;
  };
  getParentAndIndex(mathIR: MathLayoutContainer | MathLayoutSymbol | MathLayoutText): { parent: MathLayoutRow | null; indexInParent: number };
  getParentAndIndex(mathIR: MathLayout): {
    parent: MathLayoutRow | MathLayoutContainer | null;
    indexInParent: number;
  };

  setChild(mathIR: MathLayoutRow, value: MathLayoutContainer | MathLayoutSymbol | MathLayoutText, index: number): void;
  setChild(mathIR: MathLayoutContainer, value: MathLayoutRow, index: number): void;
  setChild(mathIR: MathLayout & { type: "table" }, value: MathLayoutRow, indexA: number, indexB: number): void;

  removeChild(mathIR: MathLayoutRow, value: MathLayout): void;
  insertChild(mathIR: MathLayoutRow, value: MathLayoutContainer | MathLayoutSymbol | MathLayoutText, index: number): void;

  /**
   * Recursively sets the parents, used to set all the parent links for a newly created subtree.
   * Example: `setParents(null, [mathIR]);`
   */
  setParents(parent: MathLayoutRow | MathLayoutContainer | null, children: MathLayout[]): void;
}

/**
 * Math-ir with parent pointers. Super convenient for traversing the data structure
 */
export function MathAst(mathIR: MathLayoutRow): MathAst {
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

  function getParent(mathIR: MathLayoutRow): MathLayoutContainer | null;
  function getParent(mathIR: MathLayoutContainer | MathLayoutSymbol | MathLayoutText): MathLayoutRow | null;
  function getParent(mathIR: MathLayout): MathLayoutRow | MathLayoutContainer | null {
    const parent = ast.parents.get(mathIR);
    if (parent) {
      return parent;
    } else {
      return null;
    }
  }

  function getParentAndIndex(mathIR: MathLayoutRow): {
    parent: MathLayoutContainer | null;
    indexInParent: number;
  };
  function getParentAndIndex(mathIR: MathLayoutContainer | MathLayoutSymbol | MathLayoutText): {
    parent: MathLayoutRow | null;
    indexInParent: number;
  };
  function getParentAndIndex(mathIR: MathLayout): {
    parent: MathLayoutRow | MathLayoutContainer | null;
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

  function removeChild(mathIR: MathLayoutRow, value: MathLayoutContainer | MathLayoutSymbol | MathLayoutText): void {
    assert(mathIR.type == "row");
    // Maybe check if it actually returned true
    arrayUtils.remove(mathIR.values, value);
    ast.parents.delete(value);
  }

  function insertChild(mathIR: MathLayoutRow, value: MathLayoutContainer | MathLayoutSymbol | MathLayoutText, index: number): void {
    assert(mathIR.type == "row");
    mathIR.values.splice(index, 0, value);
    ast.parents.set(value, mathIR);
  }

  function setChild(mathIR: MathLayout, value: MathLayout, indexA: number, indexB?: number): void {
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

  function setParents(parent: MathLayoutRow | MathLayoutContainer | null, children: MathLayout[]) {
    for (let i = 0; i < children.length; i++) {
      ast.parents.set(children[i], parent);

      const validParent = asRowOrContainer(children[i]);
      if (validParent != null) {
        setParents(validParent, getChildren(children[i]));
      }
    }
  }

  function asRowOrContainer(mathIR: MathLayout): MathLayoutRow | MathLayoutContainer | null {
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

  function getChildren(mathIR: MathLayout) {
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
