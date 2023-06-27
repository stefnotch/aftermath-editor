import { AbsoluteOffset, Offset } from "../input-tree/input-offset";
import { InputRowZipper } from "../input-tree/input-zipper";
import { RowIndices } from "../input-tree/row-indices";
import { RowIndicesAndRange } from "../rendering/render-result";
import { assert } from "../utils/assert";

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

  toRowIndicesAndRange(): RowIndicesAndRange {
    return {
      indices: RowIndices.fromZipper(this.zipper),
      start: this.leftOffset,
      end: this.rightOffset,
    };
  }

  toAbsoluteOffsets(): [AbsoluteOffset, AbsoluteOffset] {
    return [this.zipper.getAbsoluteOffset(this.start), this.zipper.getAbsoluteOffset(this.end)];
  }

  static fromAbsoluteOffsets(root: InputRowZipper, absoluteOffsets: [AbsoluteOffset, AbsoluteOffset]): InputRowRange {
    const positionA = root.getZipperAtOffset(absoluteOffsets[0]);
    const positionB = root.getZipperAtOffset(absoluteOffsets[1]);
    assert(positionA.zipper.equals(positionB.zipper), "Offsets must be in the same row");
    return new InputRowRange(positionA.zipper, positionA.offset, positionB.offset);
  }
}
