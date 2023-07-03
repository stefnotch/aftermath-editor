import type { Offset } from "../input-tree/input-offset";
import type { InputTree } from "../input-tree/input-tree";
import { InputRowZipper } from "../input-tree/input-zipper";
import { RowIndices } from "../input-tree/row-indices";
import { assert } from "../utils/assert";
import { InputRowRange } from "./input-row-range";

export type SerializedInputRowPosition = { indices: RowIndices; offset: Offset };

// Can't use extends, because cyclic imports.
export class InputRowPosition {
  constructor(public readonly zipper: InputRowZipper, public readonly offset: Offset) {
    assert(0 <= offset && offset <= zipper.children.length, "Offset must be valid");
  }

  range(): InputRowRange {
    return new InputRowRange(this.zipper, this.offset, this.offset);
  }

  serialize(): SerializedInputRowPosition {
    return InputRowPosition.serialize(RowIndices.fromZipper(this.zipper), this.offset);
  }

  static serialize(indices: RowIndices, offset: Offset): SerializedInputRowPosition {
    return {
      indices,
      offset,
    };
  }

  static deserialize(tree: InputTree, serialized: SerializedInputRowPosition): InputRowPosition {
    const zipper = InputRowZipper.fromRowIndices(tree.rootZipper, serialized.indices);
    return new InputRowPosition(zipper, serialized.offset);
  }

  isBeforeOrEqual(end: InputRowPosition) {
    return RowIndices.isBeforeOrEqual(
      RowIndices.fromZipper(this.zipper),
      this.offset,
      RowIndices.fromZipper(end.zipper),
      end.offset
    );
  }

  isContainedIn(range: InputRowRange) {
    return RowIndices.isContainedIn(
      RowIndices.fromZipper(this.zipper),
      this.offset,
      RowIndices.fromZipper(range.zipper),
      range.leftOffset,
      range.rightOffset
    );
  }
}
