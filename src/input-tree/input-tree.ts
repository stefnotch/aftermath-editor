import { CaretRange } from "../component/editing/math-layout-caret";
import { MathLayoutSimpleEdit } from "../editing/input-tree-edit";
import { InputRowPosition } from "../input-position/input-row-position";
import { InputRowRange } from "../input-position/input-row-range";
import { assert, assertUnreachable } from "../utils/assert";
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

  updateCaretsWithEdit(edit: MathLayoutSimpleEdit, caretsBefore: readonly CaretRange[]): CaretRange[] {
    const carets = caretsBefore.slice();
    const zipper = InputRowZipper.fromRowIndices(this.rootZipper, edit.zipper);
    if (edit.type === "insert") {
      // An insert edit only moves carets on the same row
      for (let i = 0; i < carets.length; i++) {
        const caretZipper = carets[i].range.zipper;
        if (caretZipper.equals(zipper)) {
          carets[i] = this.updateOffsets(carets[i], (offset) => {
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
      for (let i = 0; i < carets.length; i++) {
        const caretZipper = carets[i].range.zipper;
        if (caretZipper.equals(zipper)) {
          const editEndOffset = edit.index + edit.values.length;
          carets[i] = this.updateOffsets(carets[i], (offset) => {
            if (editEndOffset <= offset) {
              return offset - edit.values.length;
            } else {
              return offset;
            }
          });
        }
      }
      // and a remove edit clamps contained carets to the start of the edit
      for (let i = 0; i < carets.length; i++) {
        const editRange = new InputRowRange(zipper, edit.index, edit.index + edit.values.length);
        let caretStartPosition = carets[i].range.startPosition();
        let caretEndPosition = new InputRowPosition(carets[i].range.zipper, carets[i].range.end);
        let changed = false;
        if (caretStartPosition.isContainedIn(editRange)) {
          caretStartPosition = editRange.startPosition();
          changed = true;
        }
        if (caretEndPosition.isContainedIn(editRange)) {
          caretEndPosition = editRange.startPosition();
          changed = true;
        }
        if (changed) {
          assert(caretStartPosition.zipper.equals(caretEndPosition.zipper));
          carets[i] = new CaretRange(
            new InputRowRange(caretStartPosition.zipper, caretStartPosition.offset, caretEndPosition.offset)
          );
        }
      }
    } else {
      assertUnreachable(edit);
    }

    return carets;
  }

  private updateOffsets(caret: CaretRange, mapOffset: (offset: Offset) => Offset): CaretRange {
    return new CaretRange(new InputRowRange(caret.range.zipper, mapOffset(caret.range.start), mapOffset(caret.range.end)));
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
