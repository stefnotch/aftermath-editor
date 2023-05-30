import { Offset } from "../input-tree/math-layout-offset";
import { InputRowZipper } from "../input-tree/input-zipper";
import { RowIndices } from "../input-tree/row-indices";
import { assertUnreachable } from "../utils/assert";
import { MathLayoutCaret, SerializedCaret } from "../component/editing/math-layout-caret";
import { InputNode } from "../input-tree/input-node";

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
       * The value that was inserted.
       */
      readonly value: InputNode;
    }
  | {
      readonly type: "remove";
      readonly zipper: RowIndices;
      readonly index: number;
      /**
       * The value that was removed, used for undo.
       */
      readonly value: InputNode;
    };

export function applyEdit(root: InputRowZipper, edit: MathLayoutEdit): { root: InputRowZipper; carets: MathLayoutCaret[] } {
  if (edit.type === "multi") {
    let newRoot = root;
    for (const subEdit of edit.edits) {
      newRoot = applySimpleEdit(newRoot, subEdit);
    }
    return {
      root: newRoot,
      carets: edit.caretsAfter.map((v) => MathLayoutCaret.deserialize(newRoot, v)),
    };
  } else {
    assertUnreachable(edit.type);
  }
}

function applySimpleEdit(root: InputRowZipper, edit: MathLayoutSimpleEdit): InputRowZipper {
  if (edit.type === "insert") {
    const zipper = InputRowZipper.fromRowIndices(root, edit.zipper);
    const result = zipper.insert(edit.offset, edit.value);
    return result.newRoot;
  } else if (edit.type === "remove") {
    console.log(edit);

    const zipper = InputRowZipper.fromRowIndices(root, edit.zipper);
    const result = zipper.remove(edit.index);

    return result.newRoot;
  } else {
    assertUnreachable(edit);
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
      value: edit.value,
    };
  } else if (edit.type === "remove") {
    return {
      type: "insert",
      zipper: edit.zipper,
      offset: edit.index,
      value: edit.value,
    };
  } else {
    assertUnreachable(edit);
  }
}
