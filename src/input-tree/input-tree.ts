import { type MathLayoutSimpleEdit } from "../editing/input-tree-edit";
import { InputRowRange } from "../input-position/input-row-range";
import { assertUnreachable } from "../utils/assert";
import { type Offset } from "./input-offset";
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

  updateRangeWithEdit(edit: MathLayoutSimpleEdit, rangeBefore: InputRowRange): InputRowRange {
    let range = rangeBefore;
    const zipper = InputRowZipper.fromRowIndices(this.rootZipper, edit.zipper);
    if (edit.type === "insert") {
      // An insert edit only moves carets on the same row
      if (range.zipper.equals(zipper)) {
        range = this.updateOffsets(range, (offset) => {
          if (edit.offset <= offset) {
            return offset + edit.values.length;
          } else {
            return offset;
          }
        });
      }
    } else if (edit.type === "remove") {
      // A remove edit moves carets on the same row
      if (range.zipper.equals(zipper)) {
        const editEndOffset = edit.index + edit.values.length;
        range = this.updateOffsets(range, (offset) => {
          if (editEndOffset <= offset) {
            return offset - edit.values.length;
          } else {
            return offset;
          }
        });
      }

      // and a remove edit clamps contained carets to the start of the edit
      const editRange = new InputRowRange(zipper, edit.index, edit.index + edit.values.length);
      let changed = false;
      let caretStartOffset = 0;
      if (range.startPosition().isContainedIn(editRange)) {
        caretStartOffset = editRange.leftOffset;
        changed = true;
      }
      let caretEndOffset = 0;
      if (range.endPosition().isContainedIn(editRange)) {
        caretEndOffset = editRange.leftOffset;
        changed = true;
      }
      if (changed) {
        range = new InputRowRange(range.zipper, caretStartOffset, caretEndOffset);
      }
    } else {
      assertUnreachable(edit);
    }

    return range;
  }

  private updateOffsets(range: InputRowRange, mapOffset: (offset: Offset) => Offset): InputRowRange {
    return new InputRowRange(range.zipper, mapOffset(range.start), mapOffset(range.end));
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
