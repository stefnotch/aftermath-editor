import { AbsoluteOffset, Offset } from "../input-tree/input-offset";
import { InputRowZipper } from "../input-tree/input-zipper";
import { assert } from "../utils/assert";
import { InputRowPosition } from "./input-row-position";

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

  equals(other: InputRowRange): boolean {
    return this.zipper.equals(other.zipper) && this.start === other.start && this.end === other.end;
  }

  toAbsoluteOffsets(): [AbsoluteOffset, AbsoluteOffset] {
    return [this.zipper.startAbsoluteOffset + this.start, this.zipper.startAbsoluteOffset + this.end];
  }

  static fromAbsoluteOffsets(root: InputRowZipper, absoluteOffsets: [AbsoluteOffset, AbsoluteOffset]): InputRowRange {
    const zipper = root.getZipperAtOffset(absoluteOffsets[0]);
    const start = absoluteOffsets[0] - zipper.startAbsoluteOffset;
    const end = start + (absoluteOffsets[1] - absoluteOffsets[0]);
    return new InputRowRange(zipper, start, end);
  }
}
