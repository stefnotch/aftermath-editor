import { InputNode } from "./input-node";

/**
 * A caret offset is a number that goes from 0 to the length of the row (inclusive).
 */
export type Offset = number;

/**
 * An absolute offset that uniquely identifies an offset in an input tree.
 */
export class AbsoluteOffset {
  plus(offsetCount: number): AbsoluteOffset {
    return new AbsoluteOffset(this.value + offsetCount);
  }
  plusNode(inputNode: InputNode): AbsoluteOffset {
    return this.plus(inputNode.offsetCount + 1);
  }
  minusNode(inputNode: InputNode): AbsoluteOffset {
    return this.plus(-(inputNode.offsetCount + 1));
  }
  constructor(public readonly value: number) {}
}
