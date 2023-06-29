// Basically just mirrors the Rust side. Do make sure to keep in sync.
// And in the future, get rid of this and replace it with a full Rust implementation.
// (Might want to wait for WebAssembly Interface Types though)

import { assert } from "../utils/assert";
import { InputNode } from "./input-node";

export class InputRow {
  values: InputNode[];
  #offsetCount: number;
  constructor(values: InputNode[]) {
    let row_offsets = values.length + 1;
    let child_offsets = values.map((x) => x.offsetCount).reduce((a, b) => a + b, 0);
    this.values = values;
    this.#offsetCount = row_offsets + child_offsets;
  }
  get offsetCount() {
    return this.#offsetCount;
  }
}

export class Grid<T> {
  #values: T[];
  #width: number;

  private constructor(values: T[], width: number) {
    this.#values = values;
    this.#width = width;
  }

  static fromOneDimensional<T>(values: T[], width: number): Grid<T> {
    assert(width > 0);
    assert(values.length % width === 0);
    return new Grid(values, width);
  }

  get width() {
    return this.#width;
  }

  get height() {
    return Math.floor(this.#values.length / this.#width);
  }

  get(x: number, y: number): T | null {
    if (x >= this.width || y >= this.height) {
      return null;
    }

    return this.#values.at(this.xyToIndex(x, y)) ?? null;
  }

  getIndex(index: number): T | null {
    if (index >= this.#values.length) {
      return null;
    }
    return this.#values.at(index) ?? null;
  }

  indexToXY(index: number) {
    return { x: index % this.width, y: Math.floor(index / this.width) };
  }

  xyToIndex(x: number, y: number) {
    return y * this.width + x;
  }

  get values(): ReadonlyArray<T> {
    return this.#values;
  }

  isEmpty(): boolean {
    return this.#values.length === 0;
  }
}
