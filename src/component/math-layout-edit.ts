import { MathLayoutElement } from "../math-layout/math-layout";
import { Offset } from "../math-layout/math-layout-offset";
import { AncestorIndices, fromAncestorIndices, MathLayoutRowZipper } from "../math-layout/math-layout-zipper";
import { assert, assertUnreachable } from "../utils/assert";

export type MathLayoutEdit =
  | {
      readonly type: "multi";
      readonly edits: readonly MathLayoutSimpleEdit[];
    }
  | MathLayoutSimpleEdit;

export type MathLayoutSimpleEdit =
  | {
      readonly type: "insert";
      readonly zipper: AncestorIndices;
      readonly offset: Offset;
      readonly value: MathLayoutElement | string;
    }
  | {
      readonly type: "remove";
      readonly zipper: AncestorIndices;
      readonly index: number;
    };

// TODO: Function to turn an edit into an undo edit on the fly.
// Invariant is that undo(und(edit)) = edit.

export function applyEdit(root: MathLayoutRowZipper, edit: MathLayoutEdit): MathLayoutRowZipper {
  if (edit.type === "multi") {
    for (const subEdit of edit.edits) {
      root = applyEdit(root, subEdit);
    }
    return root;
  } else if (edit.type === "insert") {
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
    const zipper = fromAncestorIndices(root, edit.zipper);
    const result = zipper.remove(edit.index);

    return result.newRoot;
  } else {
    assertUnreachable(edit);
  }
}
