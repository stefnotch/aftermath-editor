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
