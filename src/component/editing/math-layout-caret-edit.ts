import { MathLayoutElement } from "../../math-layout/math-layout";
import {
  MathLayoutContainerZipper,
  MathLayoutTableZipper,
  MathLayoutSymbolZipper,
  getAncestorIndices,
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

// TODO: Caret + selection
export function removeAtCaret(caret: MathLayoutCaret, direction: "left" | "right", layout: MathmlLayout): CaretEdit {
  // Nothing to delete, just move the caret
  const move = () => {
    const newCaret = moveCaret(caret, direction, layout) ?? caret;
    return {
      caret: MathLayoutCaret.serialize(newCaret.zipper, newCaret.offset),
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

  const zipper = caret.zipper;
  // Row deletion
  const atCaret = getAdjacentZipper(caret, direction);
  if (atCaret === null) {
    // At the start or end of a row
    const { parent: parentZipper, indexInParent } = zipper;
    if (parentZipper == null) return { caret: MathLayoutCaret.serialize(caret.zipper, caret.offset), edits: [] };
    const parentValue = parentZipper.value;
    if (parentValue.type === "fraction") {
      if ((indexInParent === 0 && direction === "left") || (indexInParent === 1 && direction === "right")) {
        return move();
      } else {
        // Delete the fraction but keep its contents
        const parentContents = parentValue.values.flatMap((v) => v.values);
        const actions = replaceActions(parentZipper, parentContents);

        return {
          edits: actions,
          caret: MathLayoutCaret.serialize(
            parentZipper.parent,
            parentZipper.indexInParent + parentValue.values[0].values.length
          ),
        };
      }
    } else if ((parentValue.type === "sup" || parentValue.type === "sub") && direction === "left") {
      // Delete the superscript/subscript but keep its contents
      const parentContents = parentValue.values.flatMap((v) => v.values);
      const actions = replaceActions(parentZipper, parentContents);

      return {
        edits: actions,
        caret: MathLayoutCaret.serialize(parentZipper.parent, parentZipper.indexInParent),
      };
    } else if (parentValue.type === "root") {
      if ((indexInParent === 0 && direction === "right") || (indexInParent === 1 && direction === "left")) {
        // Delete root but keep its contents
        const parentContents = parentValue.values[1].values;
        const actions = replaceActions(parentZipper, parentContents);

        return {
          edits: actions,
          caret: MathLayoutCaret.serialize(parentZipper.parent, parentZipper.indexInParent),
        };
      } else {
        return move();
      }
    } else {
      return move();
    }
  } else if (atCaret.type === "symbol" || atCaret.type === "bracket" || atCaret.type === "error") {
    const actions = [removeAction(atCaret)];
    return {
      edits: actions,
      caret: MathLayoutCaret.serialize(zipper, caret.offset + (direction === "left" ? -1 : 0)),
    };
  } else if ((atCaret.type === "sup" || atCaret.type === "sub") && direction === "right") {
    // Delete the superscript/subscript but keep its contents
    // cat|^3 becomes cat|3
    const subSupContents = atCaret.value.values.flatMap((v) => v.values);
    const actions = replaceActions(atCaret, subSupContents);

    return {
      edits: actions,
      caret: MathLayoutCaret.serialize(atCaret.parent, atCaret.indexInParent),
    };
  } else {
    return move();
  }
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
export function insertAtCaret(caret: MathLayoutCaret, value: CaretInsertCommand, layout: MathmlLayout): CaretEdit {
  return null as any;
}

/**
 * Gets the zipper of the element that the caret is touching
 */
function getAdjacentZipper(
  caret: MathLayoutCaret,
  direction: "left" | "right"
): MathLayoutContainerZipper | MathLayoutTableZipper | MathLayoutSymbolZipper | null {
  const index = caret.offset + (direction === "left" ? -1 : 0);
  const adjacentZipper = arrayUtils.get(caret.zipper.children, index);
  return adjacentZipper ?? null;
}
