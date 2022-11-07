import { match } from "ts-pattern";
import { Offset } from "../math-layout/math-layout-offset";
import { tableIndexToPosition, tablePositionToIndex } from "../math-layout/math-layout-utils";
import {
  MathLayoutContainerZipper,
  MathLayoutRowZipper,
  MathLayoutTableZipper,
  MathLayoutTextZipper,
} from "../math-layout/math-layout-zipper";
import { assert, assertUnreachable } from "../utils/assert";
import { ViewportValue } from "./viewport-coordinate";

export type Direction = "left" | "right" | "up" | "down";

/**
 * Whether the editor attempts to keep the caret in the same-ish x-coordinate when moving up.
 * See https://github.com/stefnotch/mathml-editor/issues/13
 */
const KeepXPosition = false;

/**
 * Move up and down
 */
function moveVertical(
  zipper: MathLayoutRowZipper | MathLayoutTextZipper,
  direction: "up" | "down",
  desiredXPosition: ViewportValue,
  getCaretPosition: (zipper: MathLayoutRowZipper | MathLayoutTextZipper, offset: Offset) => [ViewportValue, ViewportValue]
): MathLayoutCaret | null {
  const parent = zipper.parent;
  if (parent === null) return null;

  if (
    parent.type == "fraction" ||
    parent.type == "root" ||
    parent.type == "under" ||
    parent.type == "over" ||
    parent.type === "table"
  ) {
    let newIndexInParent;
    if (parent.type === "table") {
      const position = tableIndexToPosition(parent.value, zipper.indexInParent);
      const newY = position[1] + (direction === "up" ? -1 : 1);
      newIndexInParent = tablePositionToIndex(parent.value, [position[0], newY]);
    } else {
      // Those MathLayout containers are set up such that the first child is above the second child
      newIndexInParent = zipper.indexInParent + (direction == "up" ? -1 : 1);
    }

    if (newIndexInParent < 0 || newIndexInParent >= parent.value.values.length) {
      // Reached the top/bottom
      const grandParent = parent.parent;
      if (grandParent == null) return null;
      return moveVertical(grandParent, direction, desiredXPosition, getCaretPosition);
    } else {
      // Can move up or down
      const newZipper = parent.children[newIndexInParent];

      if (KeepXPosition) {
        return moveVerticalClosestPosition(newZipper, desiredXPosition, getCaretPosition);
      } else {
        const offset = direction == "up" ? newZipper.value.values.length : 0;
        return new MathLayoutCaret(newZipper, offset);
      }
    }
  } else if (parent.type == "sup" || parent.type == "sub") {
    // We're in a subscript or superscript, so we'll try to leave it
    const grandParent = parent.parent;
    if (grandParent == null) return null;

    if ((parent.type == "sup" && direction == "down") || (parent.type == "sub" && direction == "up")) {
      return new MathLayoutCaret(grandParent, parent.indexInParent);
    } else {
      return moveVertical(grandParent, direction, desiredXPosition, getCaretPosition);
    }
  } else if (parent.type === "row") {
    return moveVertical(parent, direction, desiredXPosition, getCaretPosition);
  } else {
    assertUnreachable(parent.type);
  }
}

/**
 * Repeatedly move the caret towards the target position, until we're close enough.
 */
function moveVerticalClosestPosition(
  newZipper: MathLayoutRowZipper | MathLayoutTextZipper,
  desiredXPosition: number,
  getCaretPosition: (zipper: MathLayoutRowZipper | MathLayoutTextZipper, offset: Offset) => [ViewportValue, ViewportValue]
) {
  // TODO: Attempt to keep x-screen position. This is not trivial, especially with cases where the top fraction has some nested elements
  // Also do walk into nested elements if possible.
  let offset: Offset = 0;
  while (true) {
    const caretX = getCaretPosition(newZipper, offset)[0];
    const newOffset: Offset = offset + (caretX < desiredXPosition ? 1 : -1);
    if (!offsetInBounds(newZipper, newOffset)) break;

    const newCaretX = getCaretPosition(newZipper, newOffset)[0];
    const isBetter = Math.abs(newCaretX - desiredXPosition) < Math.abs(caretX - desiredXPosition);

    if (isBetter) {
      // Update offset
      offset = newOffset;
    } else {
      // Try moving into a nested element: 0 is right, -1 is left
      if (newZipper.type === "text" || newZipper.type === "error") {
        break;
      } else if (newZipper.type === "row") {
        const childZipper = newZipper.children[offset + (caretX < desiredXPosition ? 0 : -1)];
        assert(childZipper !== undefined);
        if (childZipper.type === "text" || childZipper.type === "error") {
          // Can we beat the currently best position?
          const childOffset = caretX < desiredXPosition ? 0 : childZipper.value.value.length;
          const childCaretX = getCaretPosition(childZipper, childOffset)[0];
          const isBetter = Math.abs(childCaretX - desiredXPosition) < Math.abs(caretX - desiredXPosition);
          if (isBetter) {
            newZipper = childZipper;
            offset = childOffset;
          }
        } else if (childZipper.type === "bracket" || childZipper.type === "symbol") {
          break; // We can't go any further
        } else if (childZipper.type === "table") {
          // TODO: Implement
        } else {
          // TODO: Implement
        }
      } else {
        assertUnreachable(newZipper.type);
      }
    }
  }
  return new MathLayoutCaret(newZipper, offset);
}

function offsetInBounds(zipper: MathLayoutRowZipper | MathLayoutTextZipper, offset: number) {
  return 0 <= offset && offset <= (zipper.type === "row" ? zipper.value.values.length : zipper.value.value.length);
}

/**
 * Move to the left or right, but always out of the current element, because we're at the very edge.
 * Make sure to first check `this.isTouchingEdge(direction)` before calling this function.
 */
function moveHorizontalBeyondEdge(
  zipper: MathLayoutRowZipper | MathLayoutTextZipper | MathLayoutContainerZipper | MathLayoutTableZipper,
  direction: "left" | "right"
): MathLayoutCaret | null {
  const parent = zipper.parent;
  if (!parent) return null;

  if (parent.type === "row") {
    // We're done once we've found a row as a parent
    const offset = zipper.indexInParent + (direction === "left" ? 0 : 1);
    return new MathLayoutCaret(parent, offset);
  } else if (zipper.type === "row") {
    // If we found a decent adjacent element, like in a fraction or a table, we can try moving to the next spot
    const adjacentIndex = zipper.indexInParent + (direction === "left" ? -1 : 1);
    if (adjacentIndex < 0 || adjacentIndex >= parent.value.values.length) {
      // We're at the very edge of the element, so we'll try to move to the parent
      return moveHorizontalBeyondEdge(parent, direction);
    } else {
      // We're in the middle of the table or fraction
      const adjacentZipper = parent.children[adjacentIndex];
      const offset = direction === "left" ? adjacentZipper.value.values.length : 0;
      return new MathLayoutCaret(adjacentZipper, offset);
    }
  } else {
    // We're at the end, move up
    return moveHorizontalBeyondEdge(parent, direction);
  }
}

/**
 * Move to the left or right, but always attempt to move into a nested element if there is one.
 */
function moveHorizontalInto(
  zipper: MathLayoutRowZipper,
  caretOffset: Offset,
  direction: "left" | "right"
): MathLayoutCaret | null {
  // Carets are always inbetween elements. Hence element[caretOffset] is the element to the right of the caret.
  const adjacentChild = zipper.children[caretOffset + (direction === "left" ? -1 : 0)];

  if (adjacentChild.type === "text" || adjacentChild.type === "error") {
    const offset = direction === "left" ? adjacentChild.value.value.length : 0;
    return new MathLayoutCaret(adjacentChild, offset);
  } else if (adjacentChild.type === "bracket" || adjacentChild.type === "symbol") {
    return null;
  } else if (
    adjacentChild.type === "table" ||
    adjacentChild.type === "fraction" ||
    adjacentChild.type === "root" ||
    adjacentChild.type === "under" ||
    adjacentChild.type === "over" ||
    adjacentChild.type === "sup" ||
    adjacentChild.type === "sub"
  ) {
    const adjacentRow =
      direction === "left" ? adjacentChild.children[adjacentChild.children.length - 1] : adjacentChild.children[0];
    const offset = direction === "left" ? adjacentRow.value.values.length : 0;
    return new MathLayoutCaret(adjacentRow, offset);
  } else {
    assertUnreachable(adjacentChild.type);
  }
}

// TODO: For text use https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter
export class MathLayoutCaret {
  constructor(public readonly zipper: MathLayoutRowZipper | MathLayoutTextZipper, public readonly offset: number) {}

  equals(other: MathLayoutCaret): boolean {
    return this.zipper.equals(other.zipper) && this.offset === other.offset;
  }

  /**
   * Returns a new caret that has been moved in a given direction. Returns null if the caret cannot be moved in that direction.
   *
   * Uses the caret position for vertical movement, to keep the caret in the same x position.
   */
  move(
    direction: Direction,
    caretPosition: [ViewportValue, ViewportValue],
    getCaretPosition: (zipper: MathLayoutRowZipper | MathLayoutTextZipper, offset: Offset) => [ViewportValue, ViewportValue]
  ): MathLayoutCaret | null {
    if (direction === "right" || direction === "left") {
      if (this.isTouchingEdge(direction)) {
        return moveHorizontalBeyondEdge(this.zipper, direction);
      } else {
        if (this.zipper.type == "row") {
          const moveIntoChildTree = moveHorizontalInto(this.zipper, this.offset, direction);
          return moveIntoChildTree ?? new MathLayoutCaret(this.zipper, this.offset + (direction === "left" ? -1 : +1));
        } else {
          // Moving in text
          return new MathLayoutCaret(this.zipper, this.offset + (direction === "left" ? -1 : +1));
        }
      }
    } else if (direction === "up" || direction === "down") {
      return moveVertical(this.zipper, direction, caretPosition[0], getCaretPosition);
    } else {
      assertUnreachable(direction);
    }
  }

  /**
   * Checks if the caret is moving at the very edge of its container
   */
  private isTouchingEdge(direction: "left" | "right"): boolean {
    return match(direction)
      .with("left", () => this.offset <= 0)
      .with("right", () => {
        if (this.zipper.type == "row") {
          return this.offset >= this.zipper.value.values.length;
        } else {
          return this.offset >= this.zipper.value.value.length;
        }
      })
      .exhaustive();
  }
}
