import { match } from "ts-pattern";
import {
  MathLayoutContainerZipper,
  MathLayoutRowZipper,
  MathLayoutTableZipper,
  MathLayoutTextZipper,
} from "../math-layout/math-layout-zipper";
import { assertUnreachable } from "../utils/assert";

export type Direction = "left" | "right" | "up" | "down";

/**
 * Move up and down
 */
function moveVertical(zipper: MathLayoutRowZipper | MathLayoutTextZipper, direction: "up" | "down"): MathLayoutCaret | null {
  // TODO: Potentially tweak this so that it attempts to keep the x-coordinate

  const parent = zipper.parent;
  if (parent === null) return null;

  if (parent.type === "table") {
    throw new Error("TODO: Not implemented");
  } else if (parent.type == "fraction" || parent.type == "root" || parent.type == "under" || parent.type == "over") {
    // Those MathLayout containers are set up such that the first child is above the second child
    const newIndexInParent = zipper.indexInParent + (direction == "up" ? -1 : 1);

    if (newIndexInParent < 0 || newIndexInParent >= parent.value.values.length) {
      // Reached the top/bottom
      const grandParent = parent.parent;
      if (grandParent == null) return null;
      return moveVertical(grandParent, direction);
    } else {
      // Can move up or down
      // TODO: Attempt to keep x-screen position. This is not trivial, especially with cases where the top fraction has some nested elements
      const newZipper = parent.children[newIndexInParent];
      const offset = direction == "up" ? newZipper.value.values.length : 0;
      return new MathLayoutCaret(newZipper, offset);
    }
  } else if (parent.type == "sup" || parent.type == "sub") {
    // We're in a subscript or superscript, so we'll try to leave it
    const grandParent = parent.parent;
    if (grandParent == null) return null;

    if ((parent.type == "sup" && direction == "down") || (parent.type == "sub" && direction == "up")) {
      return new MathLayoutCaret(grandParent, parent.indexInParent);
    } else {
      return moveVertical(grandParent, direction);
    }
  } else if (parent.type === "row") {
    return moveVertical(parent, direction);
  } else {
    assertUnreachable(parent.type);
  }
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
    // We're one once we've found a row as a parent
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
  caretOffset: number,
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

  move(direction: Direction): MathLayoutCaret | null {
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
      return moveVertical(this.zipper, direction);
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
