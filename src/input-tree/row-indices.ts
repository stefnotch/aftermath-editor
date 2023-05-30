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

export function getSharedRowIndices(indicesA: RowIndices, indicesB: RowIndices): RowIndices {
  const sharedAncestorIndices: [number, number][] = [];
  for (let i = 0; i < indicesA.indices.length && i < indicesB.indices.length; i++) {
    const a = indicesA.indices[i];
    const b = indicesB.indices[i];
    if (a[0] === b[0] && a[1] === b[1]) {
      sharedAncestorIndices.push([a[0], a[1]]);
    } else {
      break;
    }
  }

  return new RowIndices(sharedAncestorIndices);
}
