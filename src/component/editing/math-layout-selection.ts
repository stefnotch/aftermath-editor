import { getAncestorIndices } from "../../math-layout/math-layout-zipper";
import { assert } from "../../utils/assert";
import { MathLayoutCaret } from "./math-layout-caret";

export class MathLayoutSelection {
  public readonly isCollapsed: boolean;
  public readonly isForwards: boolean;
  constructor(public readonly start: MathLayoutCaret, public readonly end: MathLayoutCaret) {
    assert(start.zipper.root === end.zipper.root, "Selections must share a common parent");
    this.isCollapsed = this.start.equals(this.end);
    this.isForwards = isBeforeOrEqual(start, end);
  }

  get isBackwards(): boolean {
    return !this.isForwards;
  }

  get root() {
    return this.start.zipper.root;
  }
}

function isBeforeOrEqual(start: MathLayoutCaret, end: MathLayoutCaret) {
  const startAncestorIndices = getAncestorIndices(start.zipper).flat();
  const endAncestorIndices = getAncestorIndices(end.zipper).flat();

  for (let i = 0; i < startAncestorIndices.length || i < endAncestorIndices.length; i++) {
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
