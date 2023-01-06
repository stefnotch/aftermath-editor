import { Offset } from "./math-layout-offset";
import { AncestorIndices, fromAncestorIndices, getAncestorIndices, MathLayoutRowZipper } from "./math-layout-zipper";

export type SerializedCaret = { offset: number; zipper: AncestorIndices };

export class MathLayoutPosition {
  constructor(public readonly zipper: MathLayoutRowZipper, public readonly offset: Offset) {}

  equals(other: MathLayoutPosition): boolean {
    return this.zipper.equals(other.zipper) && this.offset === other.offset;
  }

  static serialize(zipper: MathLayoutRowZipper, offset: Offset) {
    return { zipper: getAncestorIndices(zipper), offset: offset };
  }

  static deserialize(root: MathLayoutRowZipper, serialized: SerializedCaret): MathLayoutPosition {
    const zipper = fromAncestorIndices(root, serialized.zipper);
    return new MathLayoutPosition(zipper, serialized.offset);
  }

  static toAbsoluteOffset(zipper: MathLayoutRowZipper, offset: Offset): Offset {
    return zipper.startAbsoluteOffset + offset;
  }

  static fromAbsoluteOffset(root: MathLayoutRowZipper, absoluteOffset: Offset): MathLayoutPosition {
    const zipper = root.getZipperAtOffset(absoluteOffset);
    return new MathLayoutPosition(zipper, absoluteOffset - zipper.startAbsoluteOffset);
  }
}
