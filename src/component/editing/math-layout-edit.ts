import { MathLayoutElement } from "../../math-layout/math-layout";
import { Offset } from "../../math-layout/math-layout-offset";
import { AncestorIndices, fromAncestorIndices, MathLayoutRowZipper } from "../../math-layout/math-layout-zipper";
import { assert, assertUnreachable } from "../../utils/assert";
import { MathLayoutCaret, SerializedCaret } from "../math-layout-caret";

export type MathLayoutEdit = {
  readonly type: "multi";
  readonly edits: readonly MathLayoutSimpleEdit[];
  readonly caretsBefore: readonly SerializedCaret[];
  // Not neccessarily deduplicated
  readonly caretsAfter: readonly SerializedCaret[];
};

export type MathLayoutSimpleEdit =
  | {
      readonly type: "insert";
      readonly zipper: AncestorIndices;
      readonly offset: Offset;
      /**
       * The value that was inserted.
       */
      readonly value: MathLayoutElement | string;
    }
  | {
      readonly type: "remove";
      readonly zipper: AncestorIndices;
      readonly index: number;
      /**
       * The value that was removed, used for undo.
       */
      readonly value: MathLayoutElement | string;
    };

export function applyEdit(
  root: MathLayoutRowZipper,
  edit: MathLayoutEdit
): { root: MathLayoutRowZipper; carets: MathLayoutCaret[] } {
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

function applySimpleEdit(root: MathLayoutRowZipper, edit: MathLayoutSimpleEdit): MathLayoutRowZipper {
  if (edit.type === "insert") {
    const zipper = fromAncestorIndices(root, edit.zipper);
    let result: ReturnType<typeof zipper["insert"]>;
    if (typeof edit.value === "string") {
      assert(zipper.type !== "row");
      result = zipper.insert(edit.offset, edit.value);
    } else {
      assert(zipper.type === "row");
      result = zipper.insert(edit.offset, edit.value);
    }

    return result.newRoot;
  } else if (edit.type === "remove") {
    console.log(edit);

    const zipper = fromAncestorIndices(root, edit.zipper);
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