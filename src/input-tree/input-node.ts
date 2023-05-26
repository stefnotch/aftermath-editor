// Basically just mirrors the Rust side. Do make sure to keep in sync.
// And in the future, get rid of this and replace it with a full Rust implementation.
// (Might want to wait for WebAssembly Interface Types though)

import { Grid, InputRow } from "./row";

export type InputNode = InputNodeContainer | InputNodeSymbol;

export class InputNodeContainer {
  containerType: InputNodeContainerType;
  rows: Grid<InputRow>;
  #offsetCount: number;

  private constructor(containerType: InputNodeContainerType, rows: Grid<InputRow>) {
    let offset_count = rows.values.map((row) => row.offsetCount).reduce((a, b) => a + b, 0);

    this.containerType = containerType;
    this.rows = rows;
    this.#offsetCount = offset_count;
  }

  static fraction(values: [InputRow, InputRow]) {
    return new InputNodeContainer("Fraction", Grid.fromOneDimensional(values, 1));
  }

  static root(values: [InputRow, InputRow]) {
    return new InputNodeContainer("Root", Grid.fromOneDimensional(values, 2));
  }

  static under(values: [InputRow, InputRow]) {
    return new InputNodeContainer("Under", Grid.fromOneDimensional(values, 1));
  }

  static over(values: [InputRow, InputRow]) {
    return new InputNodeContainer("Over", Grid.fromOneDimensional(values, 1));
  }

  static sup(value: InputRow) {
    return new InputNodeContainer("Sup", Grid.fromOneDimensional([value], 1));
  }

  static sub(value: InputRow) {
    return new InputNodeContainer("Sub", Grid.fromOneDimensional([value], 1));
  }

  static table(values: InputRow[], width: number) {
    return new InputNodeContainer("Table", Grid.fromOneDimensional(values, width));
  }

  get offsetCount() {
    return this.#offsetCount;
  }

  // Currently JS exclusive
  withNewValues(values: InputRow[]) {
    return new InputNodeContainer(this.containerType, Grid.fromOneDimensional(values, this.rows.width));
  }
}

export type InputNodeContainerType = "Fraction" | "Root" | "Under" | "Over" | "Sup" | "Sub" | "Table";

export class InputNodeSymbol {
  symbol: string;

  constructor(symbol: string) {
    this.symbol = symbol;
  }

  get offsetCount() {
    return 0;
  }
}
