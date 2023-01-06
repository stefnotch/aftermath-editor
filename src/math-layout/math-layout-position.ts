import { Offset } from "./math-layout-offset";
import { getAncestorIndices, MathLayoutRowZipper } from "./math-layout-zipper";

export class MathLayoutPosition {
  constructor(public readonly zipper: MathLayoutRowZipper, public readonly offset: Offset) {}

  equals(other: MathLayoutPosition): boolean {
    return this.zipper.equals(other.zipper) && this.offset === other.offset;
  }

  static toAbsoluteOffset(zipper: MathLayoutRowZipper, offset: Offset): Offset {
    return zipper.startAbsoluteOffset + offset;
  }

  static fromAbsoluteOffset(root: MathLayoutRowZipper, absoluteOffset: Offset): MathLayoutPosition {
    const zipper = root.getZipperAtOffset(absoluteOffset);
    return new MathLayoutPosition(zipper, absoluteOffset - zipper.startAbsoluteOffset);
  }
}

function isBeforeOrEqual(start: MathLayoutPosition, end: MathLayoutPosition) {
  const startAncestorIndices = getAncestorIndices(start.zipper).flat();
  const endAncestorIndices = getAncestorIndices(end.zipper).flat();

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
