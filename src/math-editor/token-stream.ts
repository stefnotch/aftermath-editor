import { assert } from "../assert";

export class TokenStream<T> {
  constructor(public value: T[], public offset: number) {}

  /**
   * Gets the current value and removes it
   */
  next(): T | undefined {
    const v = this.eof() ? undefined : this.value[this.offset];
    this.offset++;
    return v;
  }

  /**
   * Moves one step back
   */
  back() {
    assert(this.offset > 0);
    this.offset--;
  }

  /**
   * Gets the current value
   */
  peek(): T | undefined {
    return this.eof() ? undefined : this.value[this.offset];
  }

  /**
   * Checks if it's at the end of the file
   */
  eof() {
    return this.offset >= this.value.length;
  }
}
