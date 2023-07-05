import { InputGridRange } from "../input-position/input-grid-range";
import { InputRowPosition } from "../input-position/input-row-position";
import { InputRowRange } from "../input-position/input-row-range";
import { InputNodeContainer } from "../input-tree/input-node";
import { InputTree } from "../input-tree/input-tree";
import { InputRowZipper } from "../input-tree/input-zipper";
import { RowIndices } from "../input-tree/row-indices";
import { assert } from "../utils/assert";
import { memoize } from "../utils/memoize";
import type { MathLayoutSimpleEdit } from "./input-tree-edit";
import { SerializedCaret } from "./serialized-caret";

export type EditingCaretSelection =
  | {
      type: "caret";
      range: InputRowRange;
    }
  | {
      type: "grid";
      range: InputGridRange;
      // when one de-selects a grid cell, one ends up splitting the selection into two
    };

export class EditingCaret {
  constructor(
    public readonly startPosition: InputRowPosition,
    public readonly endPosition: InputRowPosition,
    public readonly hasEdited: boolean
  ) {}

  static fromRange(startPosition: InputRowPosition, endPosition: InputRowPosition): EditingCaret {
    return new EditingCaret(startPosition, endPosition, false);
  }

  updateTrees(inputTree: InputTree): EditingCaret {
    const serializedCaret = this.serialize();
    return EditingCaret.deserialize(serializedCaret, inputTree);
  }

  /**
   * When an edit happens somewhere in the tree, other carets can be moved around.
   * This function returns a new caret that is updated to reflect the edit.
   */
  withEditedRanges(inputTree: InputTree, edit: MathLayoutSimpleEdit): EditingCaret {
    const newStartPosition = inputTree.updateRangeWithEdit(edit, this.startPosition.range()).startPosition();
    const newEndPosition = inputTree.updateRangeWithEdit(edit, this.endPosition.range()).startPosition();
    return new EditingCaret(newStartPosition, newEndPosition, this.hasEdited);
  }

  #getSelection: typeof getSelection = memoize(getSelection);
  get selection() {
    return this.#getSelection(this.startPosition, this.endPosition);
  }

  serialize(): SerializedCaret {
    return new SerializedCaret(this.startPosition.serialize(), this.endPosition.serialize(), this.hasEdited);
  }

  static deserialize(serialized: SerializedCaret, tree: InputTree): EditingCaret {
    return new EditingCaret(
      InputRowPosition.deserialize(tree, serialized.startPosition),
      InputRowPosition.deserialize(tree, serialized.endPosition),
      serialized.hasEdited
    );
  }
}

function getSelection(start: InputRowPosition, end: InputRowPosition): EditingCaretSelection {
  const sharedRange = getSharedCaret(start, end);
  const isSingleElementSelected = sharedRange.leftOffset + 1 === sharedRange.rightOffset;
  if (isSingleElementSelected) {
    const indexOfSelectedElement = sharedRange.leftOffset;
    const selectedElement = sharedRange.zipper.value.values[indexOfSelectedElement];
    if (selectedElement instanceof InputNodeContainer && selectedElement.containerType === "Table") {
      const sharedParentPart = RowIndices.fromZipper(sharedRange.zipper);
      // It's possible that the table was selected normally
      const startRowIndex = RowIndices.fromZipper(start.zipper).indices.at(sharedParentPart.length) ?? null;
      const endRowIndex = RowIndices.fromZipper(end.zipper).indices.at(sharedParentPart.length) ?? null;
      assert(startRowIndex === null || startRowIndex[0] === indexOfSelectedElement);
      assert(endRowIndex === null || endRowIndex[0] === indexOfSelectedElement);
      const startIndex = startRowIndex?.[1] ?? null;
      const endIndex = endRowIndex?.[1] ?? null;

      if (startIndex === null || endIndex === null) {
        return {
          type: "caret",
          range: sharedRange,
        };
      }

      const range = new InputGridRange(sharedRange.zipper, indexOfSelectedElement, startIndex, endIndex);
      return {
        type: "grid",
        range,
      };
    }
  }

  return {
    type: "caret",
    range: sharedRange,
  };
}

/**
 * Gets a caret from two positions that might be in different rows.
 */
function getSharedCaret(startPosition: InputRowPosition, endPosition: InputRowPosition): InputRowRange {
  const startAncestorIndices = RowIndices.fromZipper(startPosition.zipper);
  const endAncestorIndices = RowIndices.fromZipper(endPosition.zipper);
  const sharedParentPart = startAncestorIndices.sharedRowIndices(endAncestorIndices);

  // We need to know the direction of the selection to know whether the caret should be at the start or end of the row
  // We also have to handle edge cases like first caret is at top of fraction and second caret is at bottom of fraction
  const isForwards = startPosition.isBeforeOrEqual(endPosition);

  // And now that we know the direction, we can compute the actual start and end offsets
  const startOffset =
    sharedParentPart.length < startAncestorIndices.length
      ? startAncestorIndices.indices[sharedParentPart.length][0] + (isForwards ? 0 : 1)
      : startPosition.offset;

  const endOffset =
    sharedParentPart.length < endAncestorIndices.length
      ? endAncestorIndices.indices[sharedParentPart.length][0] + (isForwards ? 1 : 0)
      : endPosition.offset;

  const sharedParent = InputRowZipper.fromRowIndices(startPosition.zipper.root, sharedParentPart);

  return new InputRowRange(sharedParent, startOffset, endOffset);
}
