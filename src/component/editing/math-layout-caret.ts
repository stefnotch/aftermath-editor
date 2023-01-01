import { match } from "ts-pattern";
import { Offset } from "../../math-layout/math-layout-offset";
import { tableIndexToPosition, tablePositionToIndex } from "../../math-layout/math-layout-utils";
import {
  AncestorIndices,
  fromAncestorIndices,
  getAncestorIndices,
  MathLayoutContainerZipper,
  MathLayoutRowZipper,
  MathLayoutTableZipper,
} from "../../math-layout/math-layout-zipper";
import { MathmlLayout } from "../../mathml/rendering";
import { assert, assertUnreachable } from "../../utils/assert";
import { ViewportValue } from "../viewport-coordinate";

export type Direction = "left" | "right" | "up" | "down";

export type SerializedCaret = { offset: number; zipper: AncestorIndices };

/**
 * Whether the editor attempts to keep the caret in the same-ish x-coordinate when moving up.
 * See https://github.com/stefnotch/mathml-editor/issues/13
 */
const KeepXPosition = false;

/**
 * Move up and down
 */
function moveVertical(
  zipper: MathLayoutRowZipper,
  direction: "up" | "down",
  desiredXPosition: ViewportValue,
  getCaretPosition: (zipper: MathLayoutRowZipper, offset: Offset) => [ViewportValue, ViewportValue]
): MathLayoutCaret | null {
  const parent = zipper.parent;
  if (parent === null) return null;

  if (
    parent.type == "fraction" ||
    parent.type == "root" ||
    parent.type == "under" ||
    parent.type == "over" ||
    parent.type === "table" ||
    parent.type === "text"
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
  } else {
    assertUnreachable(parent.type);
  }
}

/**
 * Repeatedly move the caret towards the target position, until we're close enough.
 */
function moveVerticalClosestPosition(
  newZipper: MathLayoutRowZipper,
  desiredXPosition: number,
  getCaretPosition: (zipper: MathLayoutRowZipper, offset: Offset) => [ViewportValue, ViewportValue]
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
      const childZipper = newZipper.children[offset + (caretX < desiredXPosition ? 0 : -1)];
      assert(childZipper !== undefined);
      if (childZipper.type === "bracket" || childZipper.type === "symbol") {
        break; // We can't go any further
      } else if (childZipper.type === "table") {
        // TODO: Implement
      } else {
        // TODO: Implement
      }
    }
  }
  return new MathLayoutCaret(newZipper, offset);
}

function offsetInBounds(zipper: MathLayoutRowZipper, offset: number) {
  return 0 <= offset && offset <= zipper.value.values.length;
}

/**
 * Move to the left or right, but always out of the current element, because we're at the very edge.
 * Make sure to first check `this.isTouchingEdge(direction)` before calling this function.
 */
function moveHorizontalBeyondEdge(
  zipper: MathLayoutRowZipper | MathLayoutContainerZipper | MathLayoutTableZipper,
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

  if (adjacentChild.type === "bracket" || adjacentChild.type === "symbol" || adjacentChild.type === "error") {
    return null;
  } else if (
    adjacentChild.type === "table" ||
    adjacentChild.type === "fraction" ||
    adjacentChild.type === "root" ||
    adjacentChild.type === "under" ||
    adjacentChild.type === "over" ||
    adjacentChild.type === "sup" ||
    adjacentChild.type === "sub" ||
    adjacentChild.type === "text"
  ) {
    const adjacentRow =
      direction === "left" ? adjacentChild.children[adjacentChild.children.length - 1] : adjacentChild.children[0];
    const offset = direction === "left" ? adjacentRow.value.values.length : 0;
    return new MathLayoutCaret(adjacentRow, offset);
  } else {
    assertUnreachable(adjacentChild.type);
  }
}

/**
 * TODO: Consider renaming to MathLayoutPosition
 */
export class MathLayoutCaret {
  constructor(public readonly zipper: MathLayoutRowZipper, public readonly offset: Offset) {}

  equals(other: MathLayoutCaret): boolean {
    return this.zipper.equals(other.zipper) && this.offset === other.offset;
  }

  static serialize(zipper: MathLayoutRowZipper, offset: Offset) {
    return { zipper: getAncestorIndices(zipper), offset: offset };
  }

  static deserialize(root: MathLayoutRowZipper, serialized: SerializedCaret): MathLayoutCaret {
    const zipper = fromAncestorIndices(root, serialized.zipper);
    return new MathLayoutCaret(zipper, serialized.offset);
  }

  static toAbsoluteOffset(zipper: MathLayoutRowZipper, offset: Offset): Offset {
    return zipper.startAbsoluteOffset + offset;
  }

  static fromAbsoluteOffset(root: MathLayoutRowZipper, absoluteOffset: Offset): MathLayoutCaret {
    const zipper = root.getZipperAtOffset(absoluteOffset);
    return new MathLayoutCaret(zipper, absoluteOffset - zipper.startAbsoluteOffset);
  }

  /**
   * Returns a new caret that has been moved in a given direction. Returns null if the caret cannot be moved in that direction.
   *
   * Uses the caret position for vertical movement, to keep the caret in the same x position.
   */
  move(
    direction: Direction,
    caretPosition: [ViewportValue, ViewportValue],
    getCaretPosition: (zipper: MathLayoutRowZipper, offset: Offset) => [ViewportValue, ViewportValue]
  ): MathLayoutCaret | null {
    if (direction === "right" || direction === "left") {
      if (this.isTouchingEdge(direction)) {
        return moveHorizontalBeyondEdge(this.zipper, direction);
      } else {
        const moveIntoChildTree = moveHorizontalInto(this.zipper, this.offset, direction);
        return moveIntoChildTree ?? new MathLayoutCaret(this.zipper, this.offset + (direction === "left" ? -1 : +1));
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
      .with("right", () => this.offset >= this.zipper.value.values.length)
      .exhaustive();
  }
}

export function moveCaret(
  caret: MathLayoutCaret,
  direction: "up" | "down" | "left" | "right",
  layout: MathmlLayout
): MathLayoutCaret | null {
  const position = layout.caretToPosition(caret.zipper, caret.offset);

  const newCaret = caret.move(direction, [position.x, position.y], (zipper, offset) => {
    const position = layout.caretToPosition(zipper, offset);
    return [position.x, position.y];
  });

  if (newCaret === null) return null;

  return newCaret;
}
