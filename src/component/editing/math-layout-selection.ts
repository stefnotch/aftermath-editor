import {
  getAncestorIndices,
  fromAncestorIndices,
  MathLayoutRowZipper,
  MathLayoutTextZipper,
  MathLayoutTableZipper,
  MathLayoutContainerZipper,
} from "../../math-layout/math-layout-zipper";
import { assert } from "../../utils/assert";
import { MathLayoutCaret } from "./math-layout-caret";
import arrayUtils from "../../utils/array-utils";

export class MathLayoutRange {
  constructor(
    public readonly zipper: MathLayoutRowZipper | MathLayoutTextZipper,
    public readonly startOffset: number,
    public readonly endOffset: number
  ) {}
}

export class MathLayoutSelection {
  public readonly isCollapsed: boolean;
  public readonly isForwards: boolean;
  constructor(public readonly start: MathLayoutCaret, public readonly end: MathLayoutCaret) {
    assert(start.zipper.root === end.zipper.root, "Selections must share a common parent");
    this.isCollapsed = this.start.equals(this.end);
    this.isForwards = isBeforeOrEqual(start, end);
  }

  public getSharedParent(): MathLayoutRowZipper | MathLayoutTextZipper {
    return getSharedParent(this.start.zipper, this.end.zipper);
  }

  /**
   * A selection of a tree can end up selecting lots of individual ranges.
   * For example, $a|b_{cd}^{e|f}$ where $b_{cd}^{e}$ is the selected part, gives you the following ranges:
   * - One for the row where $ab_{..}$ is, this is also the shared parent
   * - One for the superscript where $ef$ is
   */
  public getRanges() {
    // Start at one thing, work your way until the shared parent
    // Start at the other side, work your way until the shared parent
    if (this.isCollapsed) {
      return [];
    }

    const sharedParent = this.getSharedParent();

    const ranges: MathLayoutRange[] = [];
    let topRange: number[] = [];

    const addRanges = (zipper: MathLayoutRowZipper | MathLayoutTextZipper, index: number, direction: "right" | "left") => {
      let current = zipper as MathLayoutRowZipper | MathLayoutTextZipper | MathLayoutContainerZipper | MathLayoutTableZipper;
      while (!current.equals(sharedParent)) {
        const range =
          direction === "right"
            ? new MathLayoutRange(zipper, index, zipper.value.values.length)
            : new MathLayoutRange(zipper, 0, index);
        ranges.push(range);

        const parent = current.parent;
        assert(parent !== null);
        index = current.indexInParent;
        current = parent;
      }

      topRange.push(index);
    };

    if (this.isForwards) {
      addRanges(this.start.zipper, this.start.offset, "right");
      addRanges(this.end.zipper, this.end.offset, "left");
    } else {
      addRanges(this.end.zipper, this.end.offset, "right");
      addRanges(this.start.zipper, this.start.offset, "left");
    }

    assert(topRange.length === 2);
    ranges.push(new MathLayoutRange(sharedParent, Math.min(...topRange), Math.max(...topRange)));

    return ranges;
  }

  public get isBackwards(): boolean {
    return !this.isForwards;
  }
}

function getSharedParent(start: MathLayoutRowZipper | MathLayoutTextZipper, end: MathLayoutRowZipper | MathLayoutTextZipper) {
  // I wonder if I could make this recursive or more functional
  const startAncestorIndices = getAncestorIndices(start);
  const endAncestorIndices = getAncestorIndices(end);

  const sharedIndices = arrayUtils.takeWhile(
    startAncestorIndices.length < endAncestorIndices.length ? startAncestorIndices : endAncestorIndices,
    (index, i) => index === endAncestorIndices[i]
  );

  return fromAncestorIndices(start.root, sharedIndices);
}

function isBeforeOrEqual(start: MathLayoutCaret, end: MathLayoutCaret) {
  const startAncestorIndices = getAncestorIndices(start.zipper);
  const endAncestorIndices = getAncestorIndices(end.zipper);

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
