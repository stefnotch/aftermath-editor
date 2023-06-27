import { assert } from "../utils/assert";
import { InputNode, InputNodeContainer, InputNodeSymbol } from "./input-node";
import { InputRow } from "./row";
import { AbsoluteOffset, Offset } from "./input-offset";
import { RowIndices } from "./row-indices";
import { InputRowPosition } from "../input-position/input-row-position";

/**
 * A red-green tree: https://blog.yaakov.online/red-green-trees/
 * A zipper is a pointer to a node in a tree, with a reference to the parent node.
 * See also: http://learnyouahaskell.com/zippers
 */
interface InputZipper<ChildType extends InputZipper<any>> {
  readonly root: InputRowZipper;
  readonly indexInParent: number;
  readonly children: ChildType[];
  readonly value: any;
  readonly parent: InputZipper<any> | null;
  // That is an *absolute* offset
  containsAbsoluteOffset(absoluteOffset: AbsoluteOffset): boolean;
}

// Could also be a range, and to get a zipper, we have a constrained child type. Sorta like how a Rust Set<K> is just a HashMap<K, ()>.
// But that'd be neater in Rust, were I could do impl InputRowZipper<number> just for zippers that point at a certain index, and impl InputRowZipper<Range> for zippers that point at a range.
export class InputRowZipper implements InputZipper<InputNodeContainerZipper | InputSymbolZipper> {
  private readonly startAbsoluteOffset: AbsoluteOffset;
  constructor(
    public readonly value: InputRow,
    public readonly parent: InputNodeContainerZipper | null,
    public readonly indexInParent: number,
    startAbsoluteOffset: AbsoluteOffset
  ) {
    this.startAbsoluteOffset = startAbsoluteOffset;
  }

  static fromRoot(root: InputRow) {
    return new InputRowZipper(root, null, 0, new AbsoluteOffset(0));
  }

  static fromRowIndices(root: InputRowZipper, indices: RowIndices) {
    let current = root;
    for (let i = 0; i < indices.length; i++) {
      const [firstIndex, secondIndex] = indices.indices[i];

      const child = current.children.at(firstIndex);
      const nextChild = child?.children.at(secondIndex);
      assert(nextChild !== undefined, "Invalid ancestor indices");
      current = nextChild;
    }

    return current;
  }

  /**
   * Only makes sense if they share the same root.
   * Row zippers have a unique range.
   */
  equals(other: InputRowZipper): boolean {
    assert(this.root === other.root, "zippers must share the same root");
    const thisEndOffset = this.startAbsoluteOffset.value + this.value.offsetCount;
    const otherEndOffset = other.startAbsoluteOffset.value + other.value.offsetCount;
    return this.startAbsoluteOffset === other.startAbsoluteOffset && thisEndOffset === otherEndOffset;
  }

  get children() {
    let startOffset = this.startAbsoluteOffset;
    return this.value.values.map((v, i) => {
      const childStartOffset = startOffset.plus(1);
      startOffset = startOffset.plusNode(v);
      if (v instanceof InputNodeSymbol) {
        return new InputSymbolZipper(v, this, i, childStartOffset);
      } else {
        return new InputNodeContainerZipper(v, this, i, childStartOffset);
      }
    });
  }

  get root(): InputRowZipper {
    return this.parent?.root ?? this;
  }

  getAbsoluteOffset(offset: Offset): AbsoluteOffset {
    // See also: children getter
    let absoluteOffset = this.startAbsoluteOffset;
    for (let i = 0; i < offset; i++) {
      absoluteOffset = absoluteOffset.plusNode(this.value.values[i]);
    }
    return absoluteOffset;
  }

  getZipperAtOffset(targetOffset: AbsoluteOffset): InputRowPosition {
    assert(this.containsAbsoluteOffset(targetOffset), "offset out of range");
    const childWithOffset = this.children.find((c) => c.containsAbsoluteOffset(targetOffset)) ?? null;
    if (childWithOffset === null) {
      let absoluteOffsetInRow = this.startAbsoluteOffset;
      for (let offset = 0; offset < this.value.values.length; offset++) {
        assert(absoluteOffsetInRow.value <= targetOffset.value, "offset out of range");
        if (absoluteOffsetInRow.value === targetOffset.value) {
          return new InputRowPosition(this, offset);
        }
        absoluteOffsetInRow = absoluteOffsetInRow.plusNode(this.value.values[offset]);
      }
      assert(absoluteOffsetInRow.value === targetOffset.value); // After last child
      return new InputRowPosition(this, this.value.values.length);
    }

    const subChildWithOffset = childWithOffset.children.find((c) => c.containsAbsoluteOffset(targetOffset)) ?? null;
    assert(subChildWithOffset !== null, "child not found");
    return subChildWithOffset.getZipperAtOffset(targetOffset);
  }

  containsAbsoluteOffset(absoluteOffset: AbsoluteOffset) {
    return (
      this.startAbsoluteOffset.value <= absoluteOffset.value &&
      absoluteOffset.value < this.startAbsoluteOffset.value + this.value.offsetCount
    );
  }

  insert(offset: Offset, newChildren: InputNode[]) {
    assert(offset >= 0 && offset <= this.value.values.length, "offset out of range");
    const values = this.value.values.slice();
    values.splice(offset, 0, ...newChildren);

    const newZipper = this.replaceSelf(new InputRow(values));
    return {
      newRoot: newZipper.root,
      newZipper,
    };
  }

  remove(index: number, count: number) {
    assert(index >= 0 && index < this.value.values.length, "index out of range");
    const values = [...this.value.values.slice(0, index), ...this.value.values.slice(index + count)];
    const newZipper = this.replaceSelf(new InputRow(values));
    return {
      newRoot: newZipper.root,
      newZipper,
    };
  }

  /**
   * Mostly internal method, use insert and remove instead
   */
  replaceSelf(newValue: InputRow) {
    return new InputRowZipper(
      newValue,
      this.parent?.replaceChild(this.indexInParent, newValue) ?? null,
      this.indexInParent,
      this.startAbsoluteOffset
    );
  }

  /**
   * Mostly internal method, use insert and remove instead
   */
  replaceChild(index: number, newChild: InputNode): InputRowZipper {
    assert(index >= 0 && index < this.value.values.length, "index out of range");

    const values = this.value.values.slice();
    values[index] = newChild;
    return this.replaceSelf(new InputRow(values));
  }
}

export class InputNodeContainerZipper implements InputZipper<InputRowZipper> {
  private readonly startAbsoluteOffset: AbsoluteOffset;
  constructor(
    public readonly value: InputNodeContainer,
    public readonly parent: InputRowZipper,
    public readonly indexInParent: number,
    startAbsoluteOffset: AbsoluteOffset
  ) {
    this.startAbsoluteOffset = startAbsoluteOffset;
  }

  get type(): InputNodeContainer["containerType"] {
    return this.value.containerType;
  }

  get children() {
    let startOffset = this.startAbsoluteOffset;
    return this.value.rows.values.map((v, i) => {
      // Different logic here because a container doesn't have extra places for the caret to go
      const childStartOffset = startOffset;
      startOffset = startOffset.plus(v.offsetCount);
      return new InputRowZipper(v, this, i, childStartOffset);
    });
  }

  get root(): InputRowZipper {
    return this.parent.root;
  }

  containsAbsoluteOffset(absoluteOffset: AbsoluteOffset) {
    return (
      this.startAbsoluteOffset.value <= absoluteOffset.value &&
      absoluteOffset.value < this.startAbsoluteOffset.value + this.value.offsetCount
    );
  }

  replaceSelf(newValue: InputNodeContainer) {
    return new InputNodeContainerZipper(
      newValue,
      this.parent?.replaceChild(this.indexInParent, newValue),
      this.indexInParent,
      this.startAbsoluteOffset
    );
  }

  replaceChild(index: number, newChild: InputRow) {
    assert(index >= 0 && index < this.value.rows.values.length, "index out of range");

    const values = this.value.rows.values.slice();
    values[index] = newChild;

    return this.replaceSelf(this.value.withNewValues(values));
  }
}

export class InputSymbolZipper implements InputZipper<never> {
  private readonly startAbsoluteOffset: AbsoluteOffset;
  constructor(
    public readonly value: InputNodeSymbol,
    public readonly parent: InputRowZipper,
    public readonly indexInParent: number,
    startAbsoluteOffset: AbsoluteOffset
  ) {
    this.startAbsoluteOffset = startAbsoluteOffset;
  }

  get children() {
    return [];
  }

  get root(): InputRowZipper {
    return this.parent.root;
  }

  containsAbsoluteOffset(absoluteOffset: AbsoluteOffset) {
    return (
      this.startAbsoluteOffset.value <= absoluteOffset.value &&
      absoluteOffset.value < this.startAbsoluteOffset.value + this.value.offsetCount
    );
  }

  replaceSelf(newValue: InputNodeSymbol) {
    return new InputSymbolZipper(
      newValue,
      this.parent?.replaceChild(this.indexInParent, newValue),
      this.indexInParent,
      this.startAbsoluteOffset
    );
  }

  replaceChild(index: number, newChild: string) {
    assert(index >= 0 && index < 1, "index out of range");
    return this.replaceSelf(new InputNodeSymbol(newChild));
  }
}
