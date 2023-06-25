import { Offset } from "../input-tree/input-offset";
import { InputRowZipper } from "../input-tree/input-zipper";
import { RowIndices } from "../input-tree/row-indices";
import { InputRowRange } from "./input-row-range";

export class InputRowPosition extends InputRowRange {
  constructor(zipper: InputRowZipper, offset: Offset) {
    super(zipper, offset, offset);
  }

  get offset() {
    return this.start;
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
