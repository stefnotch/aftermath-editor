import type { Offset } from "../input-tree/input-offset";
import type { RowIndices } from "../input-tree/row-indices";
import { assertUnreachable } from "../utils/assert";
import type { InputNode } from "../input-tree/input-node";
import type { InputTree } from "../input-tree/input-tree";
import type { SerializedCaret } from "./serialized-caret";

export class MathLayoutEdit {
  constructor(
    public readonly edits: readonly MathLayoutSimpleEdit[],
    public readonly caretsBefore: readonly SerializedCaret[],
    // TODO: Must be deduplicated
    public readonly caretsAfter: readonly SerializedCaret[]
  ) {}

  get isEmpty(): boolean {
    return this.edits.length === 0;
  }

  /**
   * Mutates the tree.
   */
  applyEdit(tree: InputTree): { carets: readonly SerializedCaret[] } {
    for (const subEdit of this.edits) {
      // All the simple edits have row indices that are relative to the current tree.
      tree.applyEdit(subEdit);
    }
    return {
      carets: this.caretsAfter,
    };
  }

  /**
   * Turns an edit into an undo edit on the fly.
   * Invariant is that undo(und(edit)) = edit.
   */
  static inverseEdit(edit: MathLayoutEdit): MathLayoutEdit {
    const edits = edit.edits.map(inverseSimpleEdit);
    edits.reverse();
    return new MathLayoutEdit(edits, edit.caretsAfter, edit.caretsBefore);
  }
}

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
