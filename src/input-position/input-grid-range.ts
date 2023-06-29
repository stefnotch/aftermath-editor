import { InputNodeContainer } from "../input-tree/input-node";
import { InputRowZipper } from "../input-tree/input-zipper";
import { assert } from "../utils/assert";
import { InputRowRange } from "./input-row-range";

export class InputGridRange extends InputRowRange {
  constructor(zipper: InputRowZipper, index: number, public readonly start: number, public readonly end: number) {
    super(zipper, index, index + 1);
    assert(this.grid.containerType == "Table");
    assert(0 <= start && start <= this.grid.rows.width * this.grid.rows.height);
    assert(0 <= end && end <= this.grid.rows.width * this.grid.rows.height);
  }

  get index() {
    return this.start;
  }

  get grid(): InputNodeContainer {
    const grid = this.zipper.value.values[this.index];
    assert(grid instanceof InputNodeContainer);
    return grid;
  }

  getRow(index: number) {
    return this.grid.rows.getIndex(index);
  }
}
