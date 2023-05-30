import { Offset } from "./math-layout-offset";
import { InputRowZipper } from "./input-zipper";
import { RowIndices } from "./row-indices";

export class InputRowPosition {
  constructor(public readonly zipper: InputRowZipper, public readonly offset: Offset) {}

  equals(other: InputRowPosition): boolean {
    return this.zipper.equals(other.zipper) && this.offset === other.offset;
  }

  static toAbsoluteOffset(zipper: InputRowZipper, offset: Offset): Offset {
    return zipper.startAbsoluteOffset + offset;
  }

  static fromAbsoluteOffset(root: InputRowZipper, absoluteOffset: Offset): InputRowPosition {
    const zipper = root.getZipperAtOffset(absoluteOffset);
    return new InputRowPosition(zipper, absoluteOffset - zipper.startAbsoluteOffset);
  }

  static isBeforeOrEqual(start: InputRowPosition, end: InputRowPosition) {
    const startAncestorIndices = RowIndices.fromZipper(start.zipper).indices.flat();
    const endAncestorIndices = RowIndices.fromZipper(end.zipper).indices.flat();

    // Plus one for the offsets comparison
    for (let i = 0; i < startAncestorIndices.length + 1 || i < endAncestorIndices.length + 1; i++) {
      // - 0.5 so that we can compare an offset with an index
      // As in -0.5, 0, 0.5, 1, 1.5, 2, 2.5 with the .5 ones being the offsets
      const startValue = i < startAncestorIndices.length ? startAncestorIndices[i] : start.offset - 0.5;
      const endValue = i < endAncestorIndices.length ? endAncestorIndices[i] : end.offset - 0.5;
      if (startValue < endValue) {
        return true;
      } else if (startValue > endValue) {
        return false;
      }
    }

    return true;
  }
}
