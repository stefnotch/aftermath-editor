import { MathLayoutSelection } from "../component/editing/math-layout-selection";
import {
  AncestorIndices,
  fromAncestorIndices,
  getAncestorIndices,
  MathLayoutRowZipper,
} from "../math-layout/math-layout-zipper";

export class MathRowRange {
  constructor(
    public readonly zipper: MathLayoutRowZipper,
    public readonly startOffset: number,
    public readonly endOffset: number
  ) {}
}

export function selectionToRanges(selection: MathLayoutSelection): MathRowRange[] {}

function getSharedParent(zipperA: MathLayoutRowZipper, zipperB: MathLayoutRowZipper): MathLayoutRowZipper {
  // I wonder if I could make this recursive or more functional
  const ancestorIndicesA = getAncestorIndices(zipperA);
  const ancestorIndicesB = getAncestorIndices(zipperB);

  const sharedAncestorIndices: [number, number][] = [];
  for (let i = 0; i < ancestorIndicesA.length && i < ancestorIndicesB.length; i++) {
    const a = ancestorIndicesA[i];
    const b = ancestorIndicesB[i];
    if (a[0] === b[0] && a[1] === b[1]) {
      sharedAncestorIndices.push([a[0], a[1]]);
    } else {
      break;
    }
  }

  return fromAncestorIndices(zipperA.root, sharedAncestorIndices);
}

/**
 * A selection of a tree can end up selecting lots of individual ranges.
 * For example, $a|b_{cd}^{e|f}$ where $b_{cd}^{e}$ is the selected part, gives you the following ranges:
 * - One for the row where $ab_{..}$ is, this is also the shared parent
 * - One for the superscript where $ef$ is
 */
function getRanges() {
  // Start at one thing, work your way until the shared parent
  // Start at the other side, work your way until the shared parent
  if (this.isCollapsed) {
    return [];
  }

  const sharedParent = this.getSharedParent();

  const ranges: MathRowRange[] = [];
  let topRange: number[] = [];

  const addRanges = (zipper: MathLayoutRowZipper, index: number, direction: "right" | "left") => {
    let current = zipper as MathLayoutRowZipper | MathLayoutContainerZipper | MathLayoutTableZipper;
    while (!current.equals(sharedParent)) {
      const range =
        direction === "right"
          ? new MathRowRange(zipper, index, zipper.value.values.length)
          : new MathRowRange(zipper, 0, index);
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
  ranges.push(new MathRowRange(sharedParent, Math.min(...topRange), Math.max(...topRange)));

  return ranges;
}
