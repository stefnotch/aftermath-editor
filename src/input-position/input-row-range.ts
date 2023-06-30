import type { AbsoluteOffset, Offset } from "../input-tree/input-offset";
import type { InputTree } from "../input-tree/input-tree";
import { InputRowZipper } from "../input-tree/input-zipper";
import { RowIndices } from "../input-tree/row-indices";
import type { RowIndicesAndRange } from "../rendering/render-result";
import { assert } from "../utils/assert";
import { InputRowPosition } from "./input-row-position";

export type SerializedInputRowRange = { indices: RowIndices; start: Offset; end: Offset };

export class InputRowRange {
  constructor(public readonly zipper: InputRowZipper, public readonly start: Offset, public readonly end: Offset) {
    assert(0 <= start && start <= zipper.children.length, "Start must be valid");
    assert(0 <= end && end <= zipper.children.length, "End must be valid");
  }

  get leftOffset(): Offset {
    return this.isForwards ? this.start : this.end;
  }

  get rightOffset(): Offset {
    return this.isForwards ? this.end : this.start;
  }

  get isCollapsed() {
    return this.start === this.end;
  }

  get isForwards() {
    return this.start <= this.end;
  }

  startPosition(): InputRowPosition {
    return new InputRowPosition(this.zipper, this.start);
  }

  endPosition(): InputRowPosition {
    return new InputRowPosition(this.zipper, this.end);
  }

  leftPosition(): InputRowPosition {
    return new InputRowPosition(this.zipper, this.leftOffset);
  }

  rightPosition(): InputRowPosition {
    return new InputRowPosition(this.zipper, this.rightOffset);
  }

  toRowIndicesAndRange(): RowIndicesAndRange {
    return {
      indices: RowIndices.fromZipper(this.zipper),
      start: this.leftOffset,
      end: this.rightOffset,
    };
  }

  serialize(): SerializedInputRowRange {
    return {
      indices: RowIndices.fromZipper(this.zipper),
      start: this.start,
      end: this.end,
    };
  }

  static deserialize(tree: InputTree, serialized: SerializedInputRowRange): InputRowRange {
    const zipper = InputRowZipper.fromRowIndices(tree.rootZipper, serialized.indices);
    return new InputRowRange(zipper, serialized.start, serialized.end);
  }
}
// @ts-ignore
function toAbsoluteOffsets(x: InputRowRange): [AbsoluteOffset, AbsoluteOffset] {
  return [x.zipper.getAbsoluteOffset(x.start), x.zipper.getAbsoluteOffset(x.end)];
}

// @ts-ignore
function fromAbsoluteOffsets(root: InputRowZipper, absoluteOffsets: [AbsoluteOffset, AbsoluteOffset]): InputRowRange {
  const positionA = getZipperAtOffset(root, absoluteOffsets[0]);
  const positionB = getZipperAtOffset(root, absoluteOffsets[1]);
  assert(positionA.zipper.equals(positionB.zipper), "Offsets must be in the same row");
  return new InputRowRange(positionA.zipper, positionA.offset, positionB.offset);
}

function getZipperAtOffset(zipper: InputRowZipper, targetOffset: AbsoluteOffset): InputRowPosition {
  assert(zipper.containsAbsoluteOffset(targetOffset), "offset out of range");
  const childWithOffset = zipper.children.find((c) => c.containsAbsoluteOffset(targetOffset)) ?? null;
  if (childWithOffset === null) {
    let absoluteOffsetInRow = zipper.startAbsoluteOffset;
    for (let offset = 0; offset < zipper.value.values.length; offset++) {
      assert(absoluteOffsetInRow.value <= targetOffset.value, "offset out of range");
      if (absoluteOffsetInRow.value === targetOffset.value) {
        return new InputRowPosition(zipper, offset);
      }
      absoluteOffsetInRow = absoluteOffsetInRow.plusNode(zipper.value.values[offset]);
    }
    assert(absoluteOffsetInRow.value === targetOffset.value); // After last child
    return new InputRowPosition(zipper, zipper.value.values.length);
  }

  const subChildWithOffset = childWithOffset.children.find((c) => c.containsAbsoluteOffset(targetOffset)) ?? null;
  assert(subChildWithOffset !== null, "child not found");
  return getZipperAtOffset(subChildWithOffset, targetOffset);
}
