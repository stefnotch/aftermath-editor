import { assert } from "../utils/assert";
import { InputNode, InputNodeContainer, InputNodeSymbol } from "./input-node";
import { InputRow } from "./row";
import { AbsoluteOffset, Offset } from "./math-layout-offset";

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
  readonly startAbsoluteOffset: AbsoluteOffset;
  readonly parent: InputZipper<any> | null;
  // That is an *absolute* offset
  containsAbsoluteOffset(absoluteOffset: AbsoluteOffset): boolean;
}

export class InputRowZipper implements InputZipper<InputNodeContainerZipper | InputSymbolZipper> {
  constructor(
    public readonly value: InputRow,
    public readonly parent: InputNodeContainerZipper | null,
    public readonly indexInParent: number,
    public readonly startAbsoluteOffset: Offset
  ) {}

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
    const thisEndOffset = this.startAbsoluteOffset + this.value.offsetCount;
    const otherEndOffset = other.startAbsoluteOffset + other.value.offsetCount;
    return this.startAbsoluteOffset === other.startAbsoluteOffset && thisEndOffset === otherEndOffset;
  }

  get children() {
    let startOffset = this.startAbsoluteOffset;
    return this.value.values.map((v, i) => {
      const childStartOffset = startOffset + 1;
      startOffset = startOffset + v.offsetCount + 1;
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

  getZipperAtOffset(absoluteOffset: Offset): InputRowZipper {
    assert(this.containsAbsoluteOffset(absoluteOffset), "offset out of range");

    const childWithOffset = this.children.find((c) => c.containsAbsoluteOffset(absoluteOffset)) ?? null;
    if (childWithOffset === null) {
      return this;
    }
    const subChildWithOffset = childWithOffset.children.find((c) => c.containsAbsoluteOffset(absoluteOffset)) ?? null;
    assert(subChildWithOffset !== null, "child not found");

    return subChildWithOffset.getZipperAtOffset(absoluteOffset);
  }

  containsAbsoluteOffset(absoluteOffset: Offset): boolean {
    return this.startAbsoluteOffset <= absoluteOffset && absoluteOffset < this.startAbsoluteOffset + this.value.offsetCount;
  }

  insert(offset: Offset, newChild: InputNode) {
    assert(offset >= 0 && offset <= this.value.values.length, "offset out of range");
    const values = this.value.values.slice();
    values.splice(offset, 0, newChild);

    const newZipper = this.replaceSelf(new InputRow(values));
    return {
      newRoot: newZipper.root,
      newZipper,
    };
  }

  remove(index: number) {
    assert(index >= 0 && index < this.value.values.length, "index out of range");
    const values = [...this.value.values.slice(0, index), ...this.value.values.slice(index + 1)];
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
  constructor(
    public readonly value: InputNodeContainer,
    public readonly parent: InputRowZipper,
    public readonly indexInParent: number,
    public readonly startAbsoluteOffset: Offset
  ) {}

  get type(): InputNodeContainer["containerType"] {
    return this.value.containerType;
  }

  get children() {
    let startOffset = this.startAbsoluteOffset;
    return this.value.rows.values.map((v, i) => {
      // Different logic here because a container doesn't have extra places for the caret to go
      const childStartOffset = startOffset;
      startOffset = startOffset + v.offsetCount;
      return new InputRowZipper(v, this, i, childStartOffset);
    });
  }

  get root(): InputRowZipper {
    return this.parent.root;
  }

  containsAbsoluteOffset(absoluteOffset: Offset): boolean {
    return this.startAbsoluteOffset <= absoluteOffset && absoluteOffset < this.startAbsoluteOffset + this.value.offsetCount;
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
  constructor(
    public readonly value: InputNodeSymbol,
    public readonly parent: InputRowZipper,
    public readonly indexInParent: number,
    public readonly startAbsoluteOffset: Offset
  ) {}

  get children() {
    return [];
  }

  get root(): InputRowZipper {
    return this.parent.root;
  }

  containsAbsoluteOffset(absoluteOffset: Offset): boolean {
    return this.startAbsoluteOffset <= absoluteOffset && absoluteOffset < this.startAbsoluteOffset + this.value.offsetCount;
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

  /**
   * Gets the indices of the given zipper in the tree.
   * As in, every "indexInParent" of every element that has a parent, including the starting one.
   */
  static fromZipper(zipper: InputRowZipper): RowIndices {
    const ancestorIndices: [number, number][] = [];
    let current = zipper;
    while (true) {
      const parent = current.parent;
      if (parent === null) break;

      ancestorIndices.push([parent.indexInParent, current.indexInParent]);
      current = parent.parent;
    }
    ancestorIndices.reverse();
    return new RowIndices(ancestorIndices);
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

export function getSharedRowIndices(indicesA: RowIndices, indicesB: RowIndices): RowIndices {
  const sharedAncestorIndices: [number, number][] = [];
  for (let i = 0; i < indicesA.indices.length && i < indicesB.indices.length; i++) {
    const a = indicesA.indices[i];
    const b = indicesB.indices[i];
    if (a[0] === b[0] && a[1] === b[1]) {
      sharedAncestorIndices.push([a[0], a[1]]);
    } else {
      break;
    }
  }

  return new RowIndices(sharedAncestorIndices);
}
