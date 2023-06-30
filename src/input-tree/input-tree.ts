import { type MathLayoutSimpleEdit } from "../editing/input-tree-edit";
import { InputRowRange } from "../input-position/input-row-range";
import { assertUnreachable } from "../utils/assert";
import { type Offset } from "./input-offset";
import { InputRowZipper } from "./input-zipper";
import { InputRow } from "./row";
import { RowIndices } from "./row-indices";

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

  /**
   * Also migrates the range to the new tree.
   */
  updateRangeWithEdit(edit: MathLayoutSimpleEdit, rangeBefore: InputRowRange): InputRowRange {
    let indices = RowIndices.fromZipper(rangeBefore.zipper);
    let start = rangeBefore.start;
    let end = rangeBefore.end;
    if (edit.type === "insert") {
      // An insert edit only moves carets on the same row
      if (indices.equals(edit.zipper)) {
        const mapOffset = (offset: Offset) => {
          if (edit.offset <= offset) {
            return offset + edit.values.length;
          } else {
            return offset;
          }
        };
        start = mapOffset(start);
        end = mapOffset(end);
      }
    } else if (edit.type === "remove") {
      // A remove edit moves carets on the same row
      if (indices.equals(edit.zipper)) {
        const mapOffset = (offset: Offset) => {
          const editEndOffset = edit.index + edit.values.length;
          if (editEndOffset <= offset) {
            return offset - edit.values.length;
          } else {
            return offset;
          }
        };
        start = mapOffset(start);
        end = mapOffset(end);
      }

      // and a remove edit clamps contained carets to the start of the edit
      let changed = false;
      const mapOffset = (offset: Offset) => {
        if (RowIndices.isContainedIn(indices, offset, edit.zipper, edit.index, edit.index + edit.values.length)) {
          changed = true;
          return edit.index;
        } else {
          return offset;
        }
      };
      start = mapOffset(start);
      end = mapOffset(end);
      if (changed) {
        indices = edit.zipper;
      }
    } else {
      assertUnreachable(edit);
    }

    return new InputRowRange(InputRowZipper.fromRowIndices(this.rootZipper, indices), start, end);
  }

  /**
   * Remember to call updateRangeWithEdit after this.
   */
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
