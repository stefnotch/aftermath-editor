import { MathLayoutSimpleEdit } from "../editing/input-tree-edit";
import { InputRowRange } from "../input-position/input-row-range";
import { assertUnreachable } from "../utils/assert";
import { Offset } from "./input-offset";
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

  updateRangesWithEdit(edit: MathLayoutSimpleEdit, rangesBefore: readonly InputRowRange[]): InputRowRange[] {
    const ranges = rangesBefore.slice();
    const zipper = InputRowZipper.fromRowIndices(this.rootZipper, edit.zipper);
    if (edit.type === "insert") {
      // An insert edit only moves carets on the same row
      for (let i = 0; i < ranges.length; i++) {
        const caretZipper = ranges[i].zipper;
        if (caretZipper.equals(zipper)) {
          ranges[i] = this.updateOffsets(ranges[i], (offset) => {
            if (edit.offset <= offset) {
              return offset + edit.values.length;
            } else {
              return offset;
            }
          });
        }
      }
    } else if (edit.type === "remove") {
      // A remove edit moves carets on the same row
      for (let i = 0; i < ranges.length; i++) {
        const caretZipper = ranges[i].zipper;
        if (caretZipper.equals(zipper)) {
          const editEndOffset = edit.index + edit.values.length;
          ranges[i] = this.updateOffsets(ranges[i], (offset) => {
            if (editEndOffset <= offset) {
              return offset - edit.values.length;
            } else {
              return offset;
            }
          });
        }
      }
      // and a remove edit clamps contained carets to the start of the edit
      for (let i = 0; i < ranges.length; i++) {
        const editRange = new InputRowRange(zipper, edit.index, edit.index + edit.values.length);
        let changed = false;
        let caretStartOffset = 0;
        if (ranges[i].startPosition().isContainedIn(editRange)) {
          caretStartOffset = editRange.leftOffset;
          changed = true;
        }
        let caretEndOffset = 0;
        if (ranges[i].endPosition().isContainedIn(editRange)) {
          caretEndOffset = editRange.leftOffset;
          changed = true;
        }
        if (changed) {
          ranges[i] = new InputRowRange(ranges[i].zipper, caretStartOffset, caretEndOffset);
        }
      }
    } else {
      assertUnreachable(edit);
    }

    return ranges;
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
