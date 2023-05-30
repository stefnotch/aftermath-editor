import { InputNode } from "../../input-tree/input-node";
import { InputRow } from "../../input-tree/row";
import { MathLayoutPosition } from "../../input-tree/math-layout-position";
import { InputNodeContainerZipper, InputSymbolZipper, InputRowZipper } from "../../input-tree/math-layout-zipper";
import { RowIndices } from "../../input-tree/row-indices";
import { RenderResult } from "../../rendering/render-result";
import arrayUtils from "../../utils/array-utils";
import { MathLayoutCaret, moveCaret, SerializedCaret } from "./math-layout-caret";
import { MathLayoutSimpleEdit } from "../../editing/math-layout-edit";

export type CaretEdit = {
  /**
   * What edits to perform
   */
  edits: MathLayoutSimpleEdit[];
  /**
   * Where the caret should end up after the edits
   */
  caret: SerializedCaret;
};

export function removeAtCaret<T>(
  caret: MathLayoutCaret,
  direction: "left" | "right",
  renderResult: RenderResult<T>
): CaretEdit {
  if (caret.isCollapsed) {
    return removeAtPosition(new MathLayoutPosition(caret.zipper, caret.start), direction, renderResult);
  } else {
    return removeRange(caret);
  }
}

function removeAtPosition<T>(
  position: MathLayoutPosition,
  direction: "left" | "right",
  renderResult: RenderResult<T>
): CaretEdit {
  // Nothing to delete, just move the caret
  const move = () => {
    const caret = new MathLayoutCaret(position.zipper, position.offset, position.offset);
    const newCaret = moveCaret(caret, direction, renderResult) ?? caret;
    return {
      caret: MathLayoutCaret.serialize(newCaret.zipper, newCaret.start, newCaret.end),
      edits: [],
    };
  };

  // Remove a zipper and its children
  const removeAction = (zipper: InputNodeContainerZipper | InputSymbolZipper): MathLayoutSimpleEdit => ({
    type: "remove" as const,
    zipper: RowIndices.fromZipper(zipper.parent),
    index: zipper.indexInParent,
    value: zipper.value,
  });

  // Removes a zipper, and then inserts new elements at the same position
  const replaceActions = (zipper: InputNodeContainerZipper, values: readonly InputNode[]): MathLayoutSimpleEdit[] =>
    [removeAction(zipper)].concat(
      values.map((v, i) => ({
        type: "insert" as const,
        zipper: RowIndices.fromZipper(zipper.parent),
        offset: zipper.indexInParent + i,
        value: v,
      }))
    );

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

function removeRange(caret: MathLayoutCaret): CaretEdit {
  const ancestorIndices = RowIndices.fromZipper(caret.zipper);

  return {
    edits: arrayUtils.range(caret.leftOffset, caret.rightOffset).map((i) => ({
      type: "remove" as const,
      zipper: ancestorIndices,
      // after a removal, the next element will be at the same index
      index: caret.leftOffset,
      value: caret.zipper.value.values[i],
    })),
    caret: serializeCollapsedCaret(caret.zipper, caret.leftOffset),
  };
}

function serializeCollapsedCaret(zipper: InputRowZipper, offset: number): SerializedCaret {
  return MathLayoutCaret.serialize(zipper, offset, offset);
}

export function insertAtCaret(caret: MathLayoutCaret, value: InputRow): CaretEdit {
  if (caret.isCollapsed) {
    return insertAtPosition(new MathLayoutPosition(caret.zipper, caret.start), value);
  } else {
    const removeExisting = removeRange(caret);
    const insertAfterRemoval = insertAtPosition(new MathLayoutPosition(caret.zipper, caret.start), value);
    return {
      edits: removeExisting.edits.concat(insertAfterRemoval.edits),
      caret: insertAfterRemoval.caret,
    };
  }
}

function insertAtPosition(position: MathLayoutPosition, value: InputRow): CaretEdit {
  return {
    edits: value.values.map((v, i) => ({
      type: "insert" as const,
      zipper: RowIndices.fromZipper(position.zipper),
      offset: position.offset + i,
      value: v,
    })),
    caret: serializeCollapsedCaret(position.zipper, position.offset + value.values.length),
  };
}

/**
 * Gets the zipper of the element that the caret is touching
 */
function getAdjacentZipper(
  caret: MathLayoutPosition,
  direction: "left" | "right"
): InputNodeContainerZipper | InputSymbolZipper | null {
  const index = caret.offset + (direction === "left" ? -1 : 0);
  const adjacentZipper = arrayUtils.get(caret.zipper.children, index);
  return adjacentZipper ?? null;
}
