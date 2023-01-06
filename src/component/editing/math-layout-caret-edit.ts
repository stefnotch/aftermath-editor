import { MathLayoutElement } from "../../math-layout/math-layout";
import { MathLayoutPosition } from "../../math-layout/math-layout-position";
import {
  MathLayoutContainerZipper,
  MathLayoutTableZipper,
  MathLayoutSymbolZipper,
  getAncestorIndices,
  MathLayoutRowZipper,
} from "../../math-layout/math-layout-zipper";
import { MathmlLayout } from "../../mathml/rendering";
import arrayUtils from "../../utils/array-utils";
import { MathLayoutCaret, moveCaret, SerializedCaret } from "./math-layout-caret";
import { MathLayoutSimpleEdit } from "./math-layout-edit";

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

export function removeAtCaret(caret: MathLayoutCaret, direction: "left" | "right", layout: MathmlLayout): CaretEdit {
  if (caret.isCollapsed) {
    return removeAtPosition(new MathLayoutPosition(caret.zipper, caret.start), direction, layout);
  } else {
    return removeRange(caret);
  }
}

function removeAtPosition(position: MathLayoutPosition, direction: "left" | "right", layout: MathmlLayout): CaretEdit {
  // Nothing to delete, just move the caret
  const move = () => {
    const caret = new MathLayoutCaret(position.zipper, position.offset, position.offset);
    const newCaret = moveCaret(caret, direction, layout) ?? caret;
    return {
      caret: MathLayoutCaret.serialize(newCaret.zipper, newCaret.start, newCaret.end),
      edits: [],
    };
  };

  // Remove a zipper and its children
  const removeAction = (
    zipper: MathLayoutContainerZipper | MathLayoutTableZipper | MathLayoutSymbolZipper
  ): MathLayoutSimpleEdit => ({
    type: "remove" as const,
    zipper: getAncestorIndices(zipper.parent),
    index: zipper.indexInParent,
    value: zipper.value,
  });

  // Removes a zipper, and then inserts new elements at the same position
  const replaceActions = (
    zipper: MathLayoutContainerZipper | MathLayoutTableZipper,
    values: readonly MathLayoutElement[]
  ): MathLayoutSimpleEdit[] =>
    [removeAction(zipper)].concat(
      values.map((v, i) => ({
        type: "insert" as const,
        zipper: getAncestorIndices(zipper.parent),
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
    if (parentValue.type === "fraction" || parentValue.type === "root") {
      if ((indexInParent === 0 && direction === "left") || (indexInParent === 1 && direction === "right")) {
        return move();
      } else {
        // Delete the fraction but keep its contents
        const parentContents = parentValue.values.flatMap((v) => v.values);
        const actions = replaceActions(parentZipper, parentContents);

        return {
          edits: actions,
          caret: serializeCollapsedCaret(parentZipper.parent, parentZipper.indexInParent + parentValue.values[0].values.length),
        };
      }
    } else if ((parentValue.type === "sup" || parentValue.type === "sub") && direction === "left") {
      // Delete the superscript/subscript but keep its contents
      const parentContents = parentValue.values.flatMap((v) => v.values);
      const actions = replaceActions(parentZipper, parentContents);

      return {
        edits: actions,
        caret: serializeCollapsedCaret(parentZipper.parent, parentZipper.indexInParent),
      };
    } else {
      return move();
    }
  } else if (atCaret.type === "symbol" || atCaret.type === "bracket" || atCaret.type === "error") {
    const actions = [removeAction(atCaret)];
    return {
      edits: actions,
      caret: serializeCollapsedCaret(zipper, position.offset + (direction === "left" ? -1 : 0)),
    };
  } else if ((atCaret.type === "sup" || atCaret.type === "sub") && direction === "right") {
    // Delete the superscript/subscript but keep its contents
    // cat|^3 becomes cat|3
    const subSupContents = atCaret.value.values.flatMap((v) => v.values);
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
  const ancestorIndices = getAncestorIndices(caret.zipper);

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

function serializeCollapsedCaret(zipper: MathLayoutRowZipper, offset: number): SerializedCaret {
  return MathLayoutCaret.serialize(zipper, offset, offset);
}

export type CaretInsertCommand =
  | {
      type: "sup";
    }
  | {
      type: "sub";
    }
  | {
      type: "fraction";
    }
  | { type: "text"; value: string } // Creates a new text element if there is none, " is the shortcut
  | { type: "symbol"; value: string };
// TODO: This definitely needs access to the *parsed* stuff, not just the layout
// (I don't think the removeAtCaret function needs it, but the insertAtCaret function does)

// TODO: Would some sort of fancy "tree pattern matching" work here?

// TODO: The hardest short term thing is the multi-character shortcuts, like forall -> ∀
// Because when we hit backspace, it should change back and stuff like that.
// So we should at least somehow keep track of what the currently inserted stuff is (and clear that when we click away with the caret or something)
//
export function insertAtCaret(caret: MathLayoutPosition, value: CaretInsertCommand, layout: MathmlLayout): CaretEdit {
  return null as any;
}

/**
 * Gets the zipper of the element that the caret is touching
 */
function getAdjacentZipper(
  caret: MathLayoutPosition,
  direction: "left" | "right"
): MathLayoutContainerZipper | MathLayoutTableZipper | MathLayoutSymbolZipper | null {
  const index = caret.offset + (direction === "left" ? -1 : 0);
  const adjacentZipper = arrayUtils.get(caret.zipper.children, index);
  return adjacentZipper ?? null;
}
