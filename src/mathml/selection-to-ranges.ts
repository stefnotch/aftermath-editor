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

/**
 * A selection of a tree can end up selecting lots of individual ranges.
 * For example, $a|b_{cd}^{e|f}$ where $b_{cd}^{e}$ is the selected part, gives you the following ranges:
 * - One for the row where $ab_{..}$ is, this is also the shared parent
 * - One for the superscript where $ef$ is
 */
export function selectionToRanges(selection: MathLayoutSelection): MathRowRange[] {
  if (selection.isCollapsed) {
    return [];
  }

  const startAncestorIndices = getAncestorIndices(selection.start.zipper);
  const endAncestorIndices = getAncestorIndices(selection.end.zipper);
  const sharedParentPart = getSharedParentPart(startAncestorIndices, endAncestorIndices);
  const sharedParent = fromAncestorIndices(selection.root, sharedParentPart);

  const ranges: MathRowRange[] = [];

  if (selection.isForwards) {
    ranges.push(
      ...getRanges(sharedParent, startAncestorIndices.slice(sharedParentPart.length), selection.start.offset, "left")
    );
    ranges.push(...getRanges(sharedParent, endAncestorIndices.slice(sharedParentPart.length), selection.end.offset, "right"));
  } else {
    ranges.push(...getRanges(sharedParent, endAncestorIndices.slice(sharedParentPart.length), selection.end.offset, "left"));
    ranges.push(
      ...getRanges(sharedParent, startAncestorIndices.slice(sharedParentPart.length), selection.start.offset, "right")
    );
  }

  return ranges;
}

function getSharedParentPart(ancestorIndicesA: AncestorIndices, ancestorIndicesB: AncestorIndices): AncestorIndices {
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

  return sharedAncestorIndices;
}

/**
 * Goes top down and gets the ranges for the given direction
 */
function getRanges(
  parent: MathLayoutRowZipper,
  ancestorIndices: AncestorIndices,
  finalOffset: number,
  direction: "right" | "left"
) {
  const ranges: MathRowRange[] = [];
  for (let i = 0; i < ancestorIndices.length; i++) {
    const [containerIndex, rowIndex] = ancestorIndices[i];
    const range =
      direction === "left"
        ? new MathRowRange(parent, containerIndex + 1, parent.children.length)
        : new MathRowRange(parent, 0, containerIndex);
    ranges.push(range);

    parent = parent.children[containerIndex].children[rowIndex];
  }
  // Remove the first range, it's the shared parent
  ranges.shift();

  // Add the final range
  const range =
    direction === "left"
      ? new MathRowRange(parent, finalOffset, parent.children.length)
      : new MathRowRange(parent, 0, finalOffset);
  ranges.push(range);

  return ranges;
}
