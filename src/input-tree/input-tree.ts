import { CaretRange } from "../component/editing/math-layout-caret";
import { MathLayoutSimpleEdit } from "../editing/input-tree-edit";
import { InputRowRange } from "../input-position/input-row-range";
import { assertUnreachable } from "../utils/assert";
import { AbsoluteOffset } from "./input-offset";
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
        carets[i] = this.updateAbsoluteOffsets(carets[i], (absoluteOffset) =>
          absoluteOffsetOfEdit < absoluteOffset ? absoluteOffset + edit.values.length : absoluteOffset
        );
      }
    } else if (edit.type === "remove") {
      const absoluteOffsetOfEdit = zipper.startAbsoluteOffset + edit.index;
      for (let i = 0; i < carets.length; i++) {
        carets[i] = this.updateAbsoluteOffsets(carets[i], (absoluteOffset) =>
          absoluteOffsetOfEdit < absoluteOffset
            ? Math.max(absoluteOffset - edit.values.length, absoluteOffsetOfEdit)
            : absoluteOffset
        );
      }
    } else {
      assertUnreachable(edit);
    }

    return carets;
  }

  private updateAbsoluteOffsets(
    caret: CaretRange,
    mapAbsoluteOffset: (absoluteOffset: AbsoluteOffset) => AbsoluteOffset
  ): CaretRange {
    const absoluteOffsets = caret.range.toAbsoluteOffsets();
    let changed = false;
    for (let i = 0; i < absoluteOffsets.length; i++) {
      const newValue = mapAbsoluteOffset(absoluteOffsets[i]);
      if (newValue !== absoluteOffsets[i]) {
        absoluteOffsets[i] = newValue;
        changed = true;
      }
    }
    return changed ? new CaretRange(InputRowRange.fromAbsoluteOffsets(this.#rootZipper, absoluteOffsets)) : caret;
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
