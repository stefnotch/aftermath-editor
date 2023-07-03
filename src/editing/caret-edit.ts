import type { InputNode } from "../input-tree/input-node";
import { InputRowPosition, type SerializedInputRowPosition } from "../input-position/input-row-position";
import { InputNodeContainerZipper, InputSymbolZipper, InputRowZipper } from "../input-tree/input-zipper";
import { RowIndices } from "../input-tree/row-indices";
import type { RenderResult } from "../rendering/render-result";
import arrayUtils from "../utils/array-utils";
import { moveCaret } from "./caret-move";
import type { MathLayoutSimpleEdit } from "./input-tree-edit";
import { InputRowRange } from "../input-position/input-row-range";

export type CaretEdit = {
  /**
   * What edits to perform
   */
  edits: MathLayoutSimpleEdit[];
  /**
   * Where the caret should end up after the edits
   */
  caret: SerializedInputRowPosition;
};

export function removeAtCaret<T>(caret: InputRowRange, direction: "left" | "right", renderResult: RenderResult<T>): CaretEdit {
  if (caret.isCollapsed) {
    return removeAtPosition(caret.startPosition(), direction, renderResult);
  } else {
    return removeRange(caret);
  }
}

function removeAtPosition<T>(
  position: InputRowPosition,
  direction: "left" | "right",
  renderResult: RenderResult<T>
): CaretEdit {
  // Nothing to delete, just move the caret
  const move = () => {
    const newCaret = moveCaret(position.range(), direction, renderResult) ?? position;
    return {
      caret: newCaret.serialize(),
      edits: [],
    };
  };

  // Remove a zipper and its children
  const removeAction = (zipper: InputNodeContainerZipper | InputSymbolZipper): MathLayoutSimpleEdit => ({
    type: "remove" as const,
    indices: RowIndices.fromZipper(zipper.parent),
    index: zipper.indexInParent,
    values: [zipper.value],
  });

  // Removes a zipper, and then inserts new elements at the same position
  const replaceActions = (zipper: InputNodeContainerZipper, values: readonly InputNode[]): MathLayoutSimpleEdit[] => [
    removeAction(zipper),
    {
      type: "insert" as const,
      indices: RowIndices.fromZipper(zipper.parent),
      offset: zipper.indexInParent,
      values: values.slice(),
    },
  ];
  const zipper = position.zipper;
  // Row deletion
  const atCaret = getAdjacentZipper(position, direction);
  if (atCaret === null) {
    // At the start or end of a row
    const { parent: parentZipper, indexInParent } = zipper;
    if (parentZipper == null) return { caret: serializeCollapsedCaret(position.zipper, position.offset), edits: [] };
    const parentValue = parentZipper.value;
    if (parentValue.containerType === "Fraction" || parentValue.containerType === "Root") {
      if ((indexInParent === 0 && direction === "left") || (indexInParent === 1 && direction === "right")) {
        return move();
      } else {
        // Delete the fraction but keep its contents
        const parentContents = parentValue.rows.values.flatMap((v) => v.values);
        const actions = replaceActions(parentZipper, parentContents);

        return {
          edits: actions,
          caret: serializeCollapsedCaret(
            parentZipper.parent,
            parentZipper.indexInParent + (parentValue.rows.get(0, 0)?.values?.length ?? 0)
          ),
        };
      }
    } else if ((parentValue.containerType === "Sup" || parentValue.containerType === "Sub") && direction === "left") {
      // Delete the superscript/subscript but keep its contents
      const parentContents = parentValue.rows.values.flatMap((v) => v.values);
      const actions = replaceActions(parentZipper, parentContents);

      return {
        edits: actions,
        caret: serializeCollapsedCaret(parentZipper.parent, parentZipper.indexInParent),
      };
    } else {
      return move();
    }
  } else if (atCaret instanceof InputSymbolZipper) {
    const actions = [removeAction(atCaret)];
    return {
      edits: actions,
      caret: serializeCollapsedCaret(zipper, position.offset + (direction === "left" ? -1 : 0)),
    };
  } else if ((atCaret.type === "Sup" || atCaret.type === "Sub") && direction === "right") {
    // Delete the superscript/subscript but keep its contents
    // cat|^3 becomes cat|3
    const subSupContents = atCaret.value.rows.values.flatMap((v) => v.values);
    const actions = replaceActions(atCaret, subSupContents);

    return {
      edits: actions,
      caret: serializeCollapsedCaret(atCaret.parent, atCaret.indexInParent),
    };
  } else {
    return move();
  }
}

export function removeRange(caret: InputRowRange): CaretEdit {
  const ancestorIndices = RowIndices.fromZipper(caret.zipper);
  return {
    edits: [
      {
        type: "remove" as const,
        indices: ancestorIndices,
        // after a removal, the next element will be at the same index
        index: caret.leftOffset,
        values: caret.zipper.value.values.slice(caret.leftOffset, caret.rightOffset),
      },
    ],
    caret: serializeCollapsedCaret(caret.zipper, caret.leftOffset),
  };
}

function serializeCollapsedCaret(zipper: InputRowZipper, offset: number): SerializedInputRowPosition {
  return InputRowPosition.serialize(RowIndices.fromZipper(zipper), offset);
}

export function insertAtCaret(caret: InputRowRange, values: InputNode[]): CaretEdit {
  if (caret.isCollapsed) {
    return insertAtPosition(caret.startPosition(), values);
  } else {
    const removeExisting = removeRange(caret);
    const insertAfterRemoval = insertAtPosition(caret.leftPosition(), values);
    return {
      edits: removeExisting.edits.concat(insertAfterRemoval.edits),
      caret: insertAfterRemoval.caret,
    };
  }
}

function insertAtPosition(position: InputRowPosition, values: InputNode[]): CaretEdit {
  return {
    edits: [
      {
        type: "insert" as const,
        indices: RowIndices.fromZipper(position.zipper),
        offset: position.offset,
        values: values,
      },
    ],
    caret: serializeCollapsedCaret(position.zipper, position.offset + values.length),
  };
}

/**
 * Gets the zipper of the element that the caret is touching
 */
function getAdjacentZipper(
  caret: InputRowPosition,
  direction: "left" | "right"
): InputNodeContainerZipper | InputSymbolZipper | null {
  const index = caret.offset + (direction === "left" ? -1 : 0);
  const adjacentZipper = arrayUtils.get(caret.zipper.children, index);
  return adjacentZipper ?? null;
}
