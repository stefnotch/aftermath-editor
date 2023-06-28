import { Offset } from "../input-tree/input-offset";
import { RowIndices } from "../input-tree/row-indices";
import { assertUnreachable } from "../utils/assert";
import { CaretRange, SerializedCaret } from "../component/caret/math-layout-caret";
import { InputNode } from "../input-tree/input-node";
import { InputTree } from "../input-tree/input-tree";

export type MathLayoutEdit = {
  readonly type: "multi";
  readonly edits: readonly MathLayoutSimpleEdit[];
  readonly caretsBefore: readonly SerializedCaret[];
  // Not neccessarily deduplicated
  readonly caretsAfter: readonly SerializedCaret[];
};

/**
 * Useless note: A MathLayoutSimpleEdit[] together with the .concat() method forms an algebraic group.
 * It is associative, has an identity element ([]) and can be inverted.
 *
 * When applying multiple disjoint edits, I recommend applying them bottom to top, right to left.
 * That way, one edit doesn't afftect the indices of the other edits.
 */
export type MathLayoutSimpleEdit =
  | {
      readonly type: "insert";
      readonly zipper: RowIndices;
      readonly offset: Offset;
      /**
       * The values that were inserted.
       */
      readonly values: InputNode[];
    }
  | {
      readonly type: "remove";
      readonly zipper: RowIndices;
      readonly index: number;
      /**
       * The value that were removed, used for undo.
       */
      readonly values: InputNode[];
    };

export function applyEdit(tree: InputTree, edit: MathLayoutEdit): { carets: CaretRange[] } {
  if (edit.type === "multi") {
    for (const subEdit of edit.edits) {
      // All the simple edits have row indices that are relative to the current tree.
      tree.applyEdit(subEdit);
    }
    return {
      carets: edit.caretsAfter.map((v) => CaretRange.deserialize(tree, v)),
    };
  } else {
    assertUnreachable(edit.type);
  }
}

/**
 * Turns an edit into an undo edit on the fly.
 * Invariant is that undo(und(edit)) = edit.
 */
export function inverseEdit(edit: MathLayoutEdit): MathLayoutEdit {
  if (edit.type === "multi") {
    const edits = edit.edits.map(inverseSimpleEdit);
    edits.reverse();
    return {
      type: "multi",
      edits,
      caretsBefore: edit.caretsAfter,
      caretsAfter: edit.caretsBefore,
    };
  } else {
    assertUnreachable(edit.type);
  }
}

function inverseSimpleEdit(edit: MathLayoutSimpleEdit): MathLayoutSimpleEdit {
  if (edit.type === "insert") {
    return {
      type: "remove",
      zipper: edit.zipper,
      index: edit.offset,
      values: edit.values,
    };
  } else if (edit.type === "remove") {
    return {
      type: "insert",
      zipper: edit.zipper,
      offset: edit.index,
      values: edit.values,
    };
  } else {
    assertUnreachable(edit);
  }
}
