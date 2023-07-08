import type { Offset } from "./input-offset";
import { InputRowZipper } from "./input-zipper";

export type RowIndex = [indexOfContainer: number, indexOfRow: number];
/**
 * Indices of a row in the tree.
 * Order is "-> container -> row"
 */

export class RowIndices {
  indices: readonly RowIndex[];

  constructor(indices: readonly RowIndex[]) {
    this.indices = indices;
  }

  /**
   * Gets the indices of the given zipper in the tree.
   * As in, every "indexInParent" of every element that has a parent, including the starting one.
   */
  static fromZipper(zipper: InputRowZipper): RowIndices {
    const ancestorIndices: [number, number][] = [];
    let current = zipper;
    while (true) {
      const parent = current.parent;
      if (parent === null) break;

      ancestorIndices.push([parent.indexInParent, current.indexInParent]);
      current = parent.parent;
    }
    ancestorIndices.reverse();
    return new RowIndices(ancestorIndices);
  }

  static default(): RowIndices {
    return new RowIndices([]);
  }

  addRowIndex(index: RowIndex | null): RowIndices {
    if (index === null) return this;
    return new RowIndices(this.indices.concat([index]));
  }

  get length(): number {
    return this.indices.length;
  }

  sharedRowIndices(indicesB: RowIndices): RowIndices {
    const sharedAncestorIndices: [number, number][] = [];
    for (let i = 0; i < this.indices.length && i < indicesB.indices.length; i++) {
      const a = this.indices[i];
      const b = indicesB.indices[i];
      if (a[0] === b[0] && a[1] === b[1]) {
        sharedAncestorIndices.push([a[0], a[1]]);
      } else {
        break;
      }
    }

    return new RowIndices(sharedAncestorIndices);
  }

  static isBeforeOrEqual(start: RowIndices, startOffset: Offset, end: RowIndices, endOffset: Offset): boolean {
    const startAncestorIndices = start.indices.flat();
    const endAncestorIndices = end.indices.flat();

    // Plus one for the offsets comparison
    for (let i = 0; i < startAncestorIndices.length + 1 || i < endAncestorIndices.length + 1; i++) {
      // - 0.5 so that we can compare an offset with an index
      // As in -0.5, 0, 0.5, 1, 1.5, 2, 2.5 with the .5 ones being the offsets
      const startValue = i < startAncestorIndices.length ? startAncestorIndices[i] : startOffset - 0.5;
      const endValue = i < endAncestorIndices.length ? endAncestorIndices[i] : endOffset - 0.5;
      if (startValue < endValue) {
        return true;
      } else if (startValue > endValue) {
        return false;
      }
    }

    return true;
  }

  static isContainedIn(
    indices: RowIndices,
    offset: Offset,
    rangeIndices: RowIndices,
    rangeLeftOffset: Offset,
    rangeRightOffset: Offset
  ): boolean {
    return (
      RowIndices.isBeforeOrEqual(rangeIndices, rangeLeftOffset, indices, offset) &&
      RowIndices.isBeforeOrEqual(indices, offset, rangeIndices, rangeRightOffset)
    );
  }

  startsWith(indices: RowIndices): boolean {
    if (indices.length > this.length) return false;
    for (let i = 0; i < indices.length; i++) {
      if (indices.indices[i][0] !== this.indices[i][0] || indices.indices[i][1] !== this.indices[i][1]) {
        return false;
      }
    }
    return true;
  }

  equals(other: RowIndices) {
    return (
      this.indices.length === other.indices.length &&
      this.indices.every((v, i) => v[0] === other.indices[i][0] && v[1] === other.indices[i][1])
    );
  }

  [Symbol.iterator](): Iterator<RowIndex> {
    let i = 0;
    return {
      next: () => {
        if (i >= this.indices.length) {
          return { done: true, value: undefined };
        }
        return { done: false, value: this.indices[i++] };
      },
    };
  }
}
