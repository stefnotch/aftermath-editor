import type { Offset } from "../input-tree/input-offset";
import type { InputTree } from "../input-tree/input-tree";
import { InputRowZipper } from "../input-tree/input-zipper";
import { RowIndices } from "../input-tree/row-indices";
import { assert } from "../utils/assert";
import { InputRowRange } from "./input-row-range";

export type SerializedInputRowPosition = { indices: RowIndices; offset: Offset };

// Can't use extends, because cyclic imports.
export class InputRowPosition {
  constructor(public readonly zipper: InputRowZipper, public readonly offset: Offset) {
    assert(0 <= offset && offset <= zipper.children.length, "Offset must be valid");
  }

  range(): InputRowRange {
    return new InputRowRange(this.zipper, this.offset, this.offset);
  }

  serialize(): SerializedInputRowPosition {
    return {
      indices: RowIndices.fromZipper(this.zipper),
      offset: this.offset,
    };
  }

  static deserialize(tree: InputTree, serialized: SerializedInputRowPosition): InputRowPosition {
    const zipper = InputRowZipper.fromRowIndices(tree.rootZipper, serialized.indices);
    return new InputRowPosition(zipper, serialized.offset);
  }

  isBeforeOrEqual(end: InputRowPosition) {
    const start = this;
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

  isContainedIn(range: InputRowRange) {
    // Could be optimized
    return (
      new InputRowPosition(range.zipper, range.leftOffset).isBeforeOrEqual(this) &&
      this.isBeforeOrEqual(new InputRowPosition(range.zipper, range.rightOffset))
    );
  }
}
