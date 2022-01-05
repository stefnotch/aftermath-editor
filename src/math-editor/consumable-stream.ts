export class ConsumableStream<T> {
  readonly values: T[];
  index: number = 0;
  constructor(values: T[]) {
    this.values = values;
  }

  get value(): T {
    return this.values[this.index];
  }

  consume(): boolean {
    this.index = this.index + 1;
    return this.atEnd();
  }

  atEnd(): boolean {
    return this.index >= this.values.length;
  }
}
