import { InputNodeContainer } from "../input-tree/input-node";
import type { Offset } from "../input-tree/input-offset";
import type { InputTree } from "../input-tree/input-tree";
import { InputNodeContainerZipper, InputRowZipper } from "../input-tree/input-zipper";
import { RowIndices } from "../input-tree/row-indices";
import { assert } from "../utils/assert";

export type SerializedInputTableRange = { indices: RowIndices; index: number; start: Offset; end: Offset };

export class InputGridRange {
  constructor(
    public readonly zipper: InputRowZipper,
    public readonly index: number,
    public readonly start: Offset,
    public readonly end: Offset
  ) {
    assert(this.grid.containerType == "Table");
    assert(0 <= start && start <= this.grid.rows.width * this.grid.rows.height);
    assert(0 <= end && end <= this.grid.rows.width * this.grid.rows.height);
  }

  get grid(): InputNodeContainer {
    const grid = this.zipper.value.values[this.index];
    assert(grid instanceof InputNodeContainer);
    return grid;
  }

  getRow(index: number) {
    return this.grid.rows.getIndex(index);
  }

  getRowZippers(): InputRowZipper[] {
    const grid = this.zipper.children[this.index];
    assert(grid instanceof InputNodeContainerZipper);

    const pointA = grid.value.rows.indexToXY(this.start);
    const pointB = grid.value.rows.indexToXY(this.end);

    const minPoint = {
      x: Math.min(pointA.x, pointB.x),
      y: Math.min(pointA.y, pointB.y),
    };
    const maxPoint = {
      x: Math.max(pointA.x, pointB.x),
      y: Math.max(pointA.y, pointB.y),
    };

    const allChildren = grid.children;
    const rows: InputRowZipper[] = [];
    // nested for loops
    for (let y = minPoint.y; y <= maxPoint.y; y++) {
      for (let x = minPoint.x; x <= maxPoint.x; x++) {
        const index = grid.value.rows.xyToIndex(x, y);
        const row = allChildren[index];
        rows.push(row);
      }
    }
    return rows;
  }

  get leftOffset(): Offset {
    return this.isForwards ? this.start : this.end;
  }

  get rightOffset(): Offset {
    return this.isForwards ? this.end : this.start;
  }

  get isCollapsed() {
    return this.start === this.end;
  }

  get isForwards() {
    return this.start <= this.end;
  }

  serialize(): SerializedInputTableRange {
    return {
      indices: RowIndices.fromZipper(this.zipper),
      index: this.index,
      start: this.start,
      end: this.end,
    };
  }

  static deserialize(tree: InputTree, serialized: SerializedInputTableRange) {
    const zipper = InputRowZipper.fromRowIndices(tree.rootZipper, serialized.indices);
    return new InputGridRange(zipper, serialized.index, serialized.start, serialized.end);
  }
}
