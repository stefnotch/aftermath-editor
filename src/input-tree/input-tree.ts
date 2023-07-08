import type { ParseResult, SyntaxNode } from "../core";
import type { MathLayoutSimpleEdit } from "../editing/input-tree-edit";
import { InputRowRange } from "../input-position/input-row-range";
import { assertUnreachable } from "../utils/assert";
import type { Offset } from "./input-offset";
import { InputRowZipper } from "./input-zipper";
import { InputRow } from "./row";
import { RowIndices } from "./row-indices";

export class InputTree {
  #rootZipper: InputRowZipper;
  #parsed: ParseResult | null = null;
  #parser: (row: InputRow) => ParseResult;
  constructor(root: InputRow, parser: (row: InputRow) => ParseResult) {
    this.#rootZipper = InputRowZipper.fromRoot(root);
    this.#parser = parser;
  }

  /**
   * Gets the parsed result. Can reparse the input tree if it's out of date.
   */
  getParsed(): ParseResult {
    if (this.#parsed === null) {
      this.#parsed = this.#parser(this.root);
      console.log("Parsed", this.#parsed);
    }
    return this.#parsed;
  }

  /**
   * Gets the parsed syntax tree. Can reparse the input tree if it's out of date.
   */
  getSyntaxTree(): SyntaxNode {
    return this.getParsed().value;
  }

  get root() {
    return this.#rootZipper.value;
  }

  get rootZipper() {
    return this.#rootZipper;
  }

  replaceRoot(root: InputRow) {
    this.#rootZipper = InputRowZipper.fromRoot(root);
    this.#parsed = null;
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
      // However, in terms of indices, it also moves indices from rows below it.
      if (indices.startsWith(edit.indices)) {
        if (indices.equals(edit.indices)) {
          const mapOffset = (offset: Offset) => {
            // Avoid moving elements that are exactly where the inserted symbols are
            if (edit.offset < offset) {
              return offset + edit.values.length;
            } else {
              return offset;
            }
          };
          start = mapOffset(start);
          end = mapOffset(end);
        } else {
          const containerIndex = indices.indices[edit.indices.length - 1][0];
          if (edit.offset <= containerIndex) {
            // If the edit is before the container, move the container
            indices.indices[edit.indices.length - 1][0] += edit.values.length;
          }
        }
      }
    } else if (edit.type === "remove") {
      // A remove edit moves carets on the same row
      const editEndOffset = edit.index + edit.values.length;
      if (indices.startsWith(edit.indices)) {
        if (indices.equals(edit.indices)) {
          const mapOffset = (offsetToUpdate: Offset) => {
            if (edit.index <= offsetToUpdate && offsetToUpdate < editEndOffset) {
              return edit.index;
            } else if (editEndOffset <= offsetToUpdate) {
              return offsetToUpdate - edit.values.length;
            } else {
              return offsetToUpdate;
            }
          };
          start = mapOffset(start);
          end = mapOffset(end);
        } else if (RowIndices.isContainedIn(indices, start, edit.indices, edit.index, editEndOffset)) {
          // and a remove edit clamps contained carets in children to the start of the edit
          // if the start index is in a child, and is contained in the edit, then the end index must be contained too

          start = edit.index;
          end = edit.index;
          indices = edit.indices;
        } else {
          const containerIndex = indices.indices[edit.indices.length - 1][0];
          if (editEndOffset <= containerIndex) {
            // If the edit is before the container, move the container
            indices.indices[edit.indices.length - 1][0] -= edit.values.length;
          }
        }
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
    const zipper = InputRowZipper.fromRowIndices(this.rootZipper, edit.indices);
    if (edit.type === "insert") {
      // It's safe to keep those as zipper methods, since they construct a *new* tree instead of modifying it.
      const result = zipper.insert(edit.offset, edit.values);
      this.#rootZipper = result.newRoot;
      this.#parsed = null;
    } else if (edit.type === "remove") {
      const result = zipper.remove(edit.index, edit.values.length);
      this.#rootZipper = result.newRoot;
      this.#parsed = null;
    } else {
      assertUnreachable(edit);
    }
  }
}
