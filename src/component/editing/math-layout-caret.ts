import { match } from "ts-pattern";
import { Offset } from "../../input-tree/math-layout-offset";
import { MathLayoutPosition } from "../../input-tree/math-layout-position";
import { tableIndexToPosition, tablePositionToIndex } from "../../input-tree/math-layout-utils";
import {
  RowIndices,
  fromRowIndices,
  getRowIndices,
  getSharedRowIndices,
  MathLayoutContainerZipper,
  MathLayoutRowZipper,
  MathLayoutTableZipper,
} from "../../input-tree/math-layout-zipper";
import { assert, assertUnreachable } from "../../utils/assert";
import { ViewportValue } from "../../rendering/viewport-coordinate";
import { RenderResult } from "../../rendering/render-result";

export type Direction = "left" | "right" | "up" | "down";
export type SerializedCaret = { start: Offset; end: Offset; zipper: RowIndices };

/**
 * Whether the editor attempts to keep the caret in the same-ish x-coordinate when moving up.
 * See https://github.com/stefnotch/aftermath-editor/issues/13
 */
const KeepXPosition = false;

export class MathLayoutCaret {
  public readonly isCollapsed: boolean;
  public readonly isForwards: boolean;
  constructor(public readonly zipper: MathLayoutRowZipper, public readonly start: Offset, public readonly end: Offset) {
    assert(start >= 0 && start <= zipper.value.values.length, "Offset must be within the row");
    assert(end >= 0 && end <= zipper.value.values.length, "Offset must be within the row");
    this.isCollapsed = this.start === this.end;
    this.isForwards = this.start <= this.end;
  }

  get leftOffset(): Offset {
    return this.isForwards ? this.start : this.end;
  }

  get rightOffset(): Offset {
    return this.isForwards ? this.end : this.start;
  }

  static serialize(zipper: MathLayoutRowZipper, start: Offset, end: Offset): SerializedCaret {
    return { zipper: getRowIndices(zipper), start, end };
  }

  static deserialize(root: MathLayoutRowZipper, serialized: SerializedCaret): MathLayoutCaret {
    const zipper = fromRowIndices(root, serialized.zipper);
    return new MathLayoutCaret(zipper, serialized.start, serialized.end);
  }

  /**
   * Gets a caret from two positions that might be in different rows.
   */
  static getSharedCaret(startPosition: MathLayoutPosition, endPosition: MathLayoutPosition): MathLayoutCaret {
    const startAncestorIndices = getRowIndices(startPosition.zipper);
    const endAncestorIndices = getRowIndices(endPosition.zipper);
    const sharedParentPart = getSharedRowIndices(startAncestorIndices, endAncestorIndices);
    const sharedParent = fromRowIndices(startPosition.zipper.root, sharedParentPart);

    // We need to know the direction of the selection to know whether the caret should be at the start or end of the row
    // We also have to handle edge cases like first caret is at top of fraction and second caret is at bottom of fraction
    const isForwards = MathLayoutPosition.isBeforeOrEqual(startPosition, endPosition);

    // And now that we know the direction, we can compute the actual start and end offsets
    const startOffset =
      sharedParentPart.length < startAncestorIndices.length
        ? startAncestorIndices[sharedParentPart.length][0] + (isForwards ? 0 : 1)
        : startPosition.offset;

    const endOffset =
      sharedParentPart.length < endAncestorIndices.length
        ? endAncestorIndices[sharedParentPart.length][0] + (isForwards ? 1 : 0)
        : endPosition.offset;

    return new MathLayoutCaret(sharedParent, startOffset, endOffset);
  }
}

export function moveCaret<T>(
  caret: MathLayoutCaret,
  direction: "up" | "down" | "left" | "right",
  renderResult: RenderResult<T>
): MathLayoutCaret | null {
  const layoutPosition = new MathLayoutPosition(
    caret.zipper,
    direction === "left" || direction === "up" ? caret.leftOffset : caret.rightOffset
  );
  const viewportPosition = renderResult.getViewportSelection({
    indices: getRowIndices(layoutPosition.zipper),
    start: layoutPosition.offset,
    end: layoutPosition.offset,
  });

  const newPosition = movePositionRecursive(
    layoutPosition,
    direction,
    [viewportPosition.rect.x, viewportPosition.baseline],
    (layoutPosition) => {
      const position = renderResult.getViewportSelection({
        indices: getRowIndices(layoutPosition.zipper),
        start: layoutPosition.offset,
        end: layoutPosition.offset,
      });
      return [position.rect.x, position.baseline];
    }
  );

  if (newPosition === null) return null;

  return new MathLayoutCaret(newPosition.zipper, newPosition.offset, newPosition.offset);
}

/**
 * Move up and down
 */
function moveVertical(
  zipper: MathLayoutRowZipper,
  direction: "up" | "down",
  desiredXPosition: ViewportValue,
  getCaretPosition: (layoutPosition: MathLayoutPosition) => [ViewportValue, ViewportValue]
): MathLayoutPosition | null {
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
        return new MathLayoutPosition(newZipper, offset);
      }
    }
  } else if (parent.type == "sup" || parent.type == "sub") {
    // We're in a subscript or superscript, so we'll try to leave it
    const grandParent = parent.parent;
    if (grandParent == null) return null;

    if ((parent.type == "sup" && direction == "down") || (parent.type == "sub" && direction == "up")) {
      return new MathLayoutPosition(grandParent, parent.indexInParent);
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
  getCaretPosition: (layoutPosition: MathLayoutPosition) => [ViewportValue, ViewportValue]
) {
  // TODO: Attempt to keep x-screen position. This is not trivial, especially with cases where the top fraction has some nested elements
  // Also do walk into nested elements if possible.
  let offset: Offset = 0;
  while (true) {
    const caretX = getCaretPosition(new MathLayoutPosition(newZipper, offset))[0];
    const newOffset: Offset = offset + (caretX < desiredXPosition ? 1 : -1);
    if (!offsetInBounds(newZipper, newOffset)) break;

    const newCaretX = getCaretPosition(new MathLayoutPosition(newZipper, newOffset))[0];
    const isBetter = Math.abs(newCaretX - desiredXPosition) < Math.abs(caretX - desiredXPosition);

    if (isBetter) {
      // Update offset
      offset = newOffset;
    } else {
      // Try moving into a nested element: 0 is right, -1 is left
      const childZipper = newZipper.children[offset + (caretX < desiredXPosition ? 0 : -1)];
      assert(childZipper !== undefined);
      if (childZipper.type === "symbol") {
        break; // We can't go any further
      } else if (childZipper.type === "table") {
        // TODO: Implement
      } else {
        // TODO: Implement
      }
    }
  }
  return new MathLayoutPosition(newZipper, offset);
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
): MathLayoutPosition | null {
  const parent = zipper.parent;
  if (!parent) return null;

  if (parent.type === "row") {
    // We're done once we've found a row as a parent
    const offset = zipper.indexInParent + (direction === "left" ? 0 : 1);
    return new MathLayoutPosition(parent, offset);
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
      return new MathLayoutPosition(adjacentZipper, offset);
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
): MathLayoutPosition | null {
  // Carets are always inbetween elements. Hence element[caretOffset] is the element to the right of the caret.
  const adjacentChild = zipper.children[caretOffset + (direction === "left" ? -1 : 0)];

  if (adjacentChild.type === "symbol" || adjacentChild.type === "error") {
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
    return new MathLayoutPosition(adjacentRow, offset);
  } else {
    assertUnreachable(adjacentChild.type);
  }
}

/**
 * Returns a new caret that has been moved in a given direction. Returns null if the caret cannot be moved in that direction.
 *
 * Uses the caret position for vertical movement, to keep the caret in the same x position.
 */
function movePositionRecursive(
  caret: MathLayoutPosition,
  direction: Direction,
  caretPosition: [ViewportValue, ViewportValue],
  getCaretPosition: (layoutPosition: MathLayoutPosition) => [ViewportValue, ViewportValue]
): MathLayoutPosition | null {
  if (direction === "right" || direction === "left") {
    if (isTouchingEdge(caret, direction)) {
      return moveHorizontalBeyondEdge(caret.zipper, direction);
    } else {
      const moveIntoChildTree = moveHorizontalInto(caret.zipper, caret.offset, direction);
      return moveIntoChildTree ?? new MathLayoutPosition(caret.zipper, caret.offset + (direction === "left" ? -1 : +1));
    }
  } else if (direction === "up" || direction === "down") {
    return moveVertical(caret.zipper, direction, caretPosition[0], getCaretPosition);
  } else {
    assertUnreachable(direction);
  }
}

/**
 * Checks if the caret is moving at the very edge of its container
 */
function isTouchingEdge(position: MathLayoutPosition, direction: "left" | "right"): boolean {
  return match(direction)
    .with("left", () => position.offset <= 0)
    .with("right", () => position.offset >= position.zipper.value.values.length)
    .exhaustive();
}
