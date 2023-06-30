import type { SyntaxNode } from "../core";
import { InputGridRange } from "../input-position/input-grid-range";
import { InputRowPosition } from "../input-position/input-row-position";
import { InputRowRange } from "../input-position/input-row-range";
import { type InputNode, InputNodeContainer } from "../input-tree/input-node";
import { InputTree } from "../input-tree/input-tree";
import { InputRowZipper } from "../input-tree/input-zipper";
import { RowIndices } from "../input-tree/row-indices";
import { memoize } from "../utils/memoize";
import { getTokenAtPosition } from "./editing-caret-current-tokens";
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
    /**
     * Range of input nodes that are currently being edited. Used for autocompletions.
     */
    public readonly currentTokens: InputRowRange | null,
    public readonly hasEdited: boolean
  ) {}

  static fromRange(startPosition: InputRowPosition, endPosition: InputRowPosition, syntaxTree: SyntaxNode): EditingCaret {
    return new EditingCaret(
      startPosition,
      endPosition,
      EditingCaret.getTokenFromSelection(syntaxTree, getSelection(startPosition, endPosition)),
      false
    );
  }

  updateTrees(inputTree: InputTree): EditingCaret {
    const serializedCaret = this.serialize();
    return EditingCaret.deserialize(serializedCaret, inputTree);
  }

  updateMissingCurrentToken(syntaxTree: SyntaxNode) {
    if (this.currentTokens === null) {
      return new EditingCaret(
        this.startPosition,
        this.endPosition,
        EditingCaret.getTokenFromSelection(syntaxTree, getSelection(this.startPosition, this.endPosition)),
        this.hasEdited
      );
    }
    return this;
  }

  /**
   * When an edit happens somewhere in the tree, other carets can be moved around.
   * This function returns a new caret that is updated to reflect the edit.
   */
  withEditedRanges(inputTree: InputTree, edit: MathLayoutSimpleEdit): EditingCaret {
    const newStartPosition = inputTree.updateRangeWithEdit(edit, this.startPosition.range()).startPosition();
    const newEndPosition = inputTree.updateRangeWithEdit(edit, this.endPosition.range()).startPosition();
    const newCurrentTokens = this.currentTokens !== null ? inputTree.updateRangeWithEdit(edit, this.currentTokens) : null;
    return new EditingCaret(newStartPosition, newEndPosition, newCurrentTokens, this.hasEdited);
  }

  #getSelection: typeof getSelection = memoize(getSelection);
  get selection() {
    return this.#getSelection(this.startPosition, this.endPosition);
  }

  getAutocompleteNodes(): InputNode[] {
    if (!this.currentTokens) {
      return [];
    }
    return this.currentTokens.zipper.value.values.slice(this.currentTokens.start, this.endPosition.offset);
  }

  serialize(): SerializedCaret {
    return new SerializedCaret(
      this.startPosition.serialize(),
      this.endPosition.serialize(),
      this.currentTokens?.serialize() ?? null,
      this.hasEdited
    );
  }

  static deserialize(serialized: SerializedCaret, tree: InputTree): EditingCaret {
    return new EditingCaret(
      InputRowPosition.deserialize(tree, serialized.startPosition),
      InputRowPosition.deserialize(tree, serialized.endPosition),
      serialized.currentTokens !== null ? InputRowRange.deserialize(tree, serialized.currentTokens) : null,
      serialized.hasEdited
    );
  }

  static getTokenFromSelection(syntaxTree: SyntaxNode, caretSelection: EditingCaretSelection): InputRowRange | null {
    if (caretSelection.type === "caret" && caretSelection.range.isCollapsed) {
      return getTokenAtPosition(syntaxTree, caretSelection.range.startPosition());
    } else {
      return null;
    }
  }
}

function getSelection(start: InputRowPosition, end: InputRowPosition): EditingCaretSelection {
  const sharedRange = getSharedCaret(start, end);
  const isSingleElementSelected = sharedRange.start + 1 === sharedRange.end;
  if (isSingleElementSelected) {
    const selectedElement = sharedRange.zipper.value.values[sharedRange.start];
    if (selectedElement instanceof InputNodeContainer && selectedElement.containerType === "Table") {
      const sharedParentPart = RowIndices.fromZipper(sharedRange.zipper);
      const startIndex = RowIndices.fromZipper(start.zipper).indices[sharedParentPart.length + 1][0];
      const endIndex = RowIndices.fromZipper(end.zipper).indices[sharedParentPart.length + 1][0];

      const range = new InputGridRange(sharedRange.zipper, sharedRange.start, startIndex, endIndex);
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
