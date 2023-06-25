import { CaretRange } from "../component/editing/math-layout-caret";
import { MathLayoutSimpleEdit } from "../editing/input-tree-edit";
import { InputRowRange } from "../input-position/input-row-range";
import { assertUnreachable } from "../utils/assert";
import { InputRowZipper } from "./input-zipper";
import { InputRow } from "./row";

export class InputTree {
  #rootZipper: InputRowZipper;
  constructor(root: InputRow) {
    this.#rootZipper = InputRowZipper.fromRoot(root);
  }

  get root() {
    return this.#rootZipper.value;
  }

  get rootZipper() {
    return this.#rootZipper;
  }

  updateCaretWithEdit(edit: MathLayoutSimpleEdit, caretsBefore: readonly CaretRange[]): CaretRange[] {
    const carets = caretsBefore.slice();
    const zipper = InputRowZipper.fromRowIndices(this.rootZipper, edit.zipper);
    if (edit.type === "insert") {
      const absoluteOffsetOfEdit = zipper.startAbsoluteOffset + edit.offset;
      for (let i = 0; i < carets.length; i++) {
        const absoluteOffsets = carets[i].range
          .toAbsoluteOffsets()
          .map((absoluteOffset) => (absoluteOffsetOfEdit < absoluteOffset ? absoluteOffset + 1 : absoluteOffset)) as [
          number,
          number
        ];
        carets[i] = new CaretRange(InputRowRange.fromAbsoluteOffsets(this.#rootZipper, absoluteOffsets));
      }
    } else if (edit.type === "remove") {
      const absoluteOffsetOfEdit = zipper.startAbsoluteOffset + edit.index;
      for (let i = 0; i < carets.length; i++) {
        const absoluteOffsets = carets[i].range
          .toAbsoluteOffsets()
          .map((absoluteOffset) => (absoluteOffsetOfEdit < absoluteOffset ? absoluteOffset - 1 : absoluteOffset)) as [
          number,
          number
        ];
        carets[i] = new CaretRange(InputRowRange.fromAbsoluteOffsets(this.#rootZipper, absoluteOffsets));
      }
    } else {
      assertUnreachable(edit);
    }

    return carets;
  }

  applyEdit(edit: MathLayoutSimpleEdit) {
    // Alternate design would create a new InputTree
    const zipper = InputRowZipper.fromRowIndices(this.rootZipper, edit.zipper);
    if (edit.type === "insert") {
      // It's safe to keep those as zipper methods, since they construct a *new* tree instead of modifying it.
      const result = zipper.insert(edit.offset, edit.values);
      this.#rootZipper = result.newRoot;
    } else if (edit.type === "remove") {
      const result = zipper.remove(edit.index, edit.values.length);
      this.#rootZipper = result.newRoot;
    } else {
      assertUnreachable(edit);
    }
  }
}
