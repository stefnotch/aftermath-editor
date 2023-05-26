import { assert } from "../utils/assert";
import {
  MathLayoutRow,
  MathLayoutContainer,
  MathLayoutTable,
  MathLayoutSymbol,
  isMathLayoutSymbol,
  isMathLayoutTable,
  MathLayoutElement,
} from "./math-layout";
import { Offset } from "./math-layout-offset";
import { mathLayoutWithWidth } from "./math-layout-utils";

/**
 * A red-green tree: https://blog.yaakov.online/red-green-trees/
 * A zipper is a pointer to a node in a tree, with a reference to the parent node.
 * See also: http://learnyouahaskell.com/zippers
 */
interface MathLayoutZipper<ChildType extends MathLayoutZipper<any>> {
  readonly type: MathLayoutRow["type"] | MathLayoutElement["type"];
  readonly root: MathLayoutRowZipper;
  readonly indexInParent: number;
  readonly children: ChildType[];
  readonly value: any;
  // That is an *absolute* offset
  readonly startAbsoluteOffset: Offset;
  readonly parent: MathLayoutZipper<any> | null;
  // That is an *absolute* offset
  containsAbsoluteOffset(absoluteOffset: Offset): boolean;
}

/**
 * TODO:
For a full implementation, we would still need some further details such as:

    Equality and HashCode overrides so that two identical RedNode<T>s are considered equal.
    Utility methods to easily replace part of a RedGreenTree<T>, which would return a new RedGreenTree<T> (since they're immutable) sharing the remaining nodes with the old tree object.

    TODO: Performance maybe
    https://github.com/KirillOsenkov/Bliki/wiki/Roslyn-Immutable-Trees
 */

export class MathLayoutRowZipper
  implements MathLayoutZipper<MathLayoutContainerZipper | MathLayoutSymbolZipper | MathLayoutTableZipper>
{
  constructor(
    public readonly value: MathLayoutRow,
    public readonly parent: MathLayoutContainerZipper | MathLayoutTableZipper | null,
    public readonly indexInParent: number,
    public readonly startAbsoluteOffset: Offset
  ) {}

  /**
   * Only makes sense if they share the same root.
   * Row zippers have a unique range.
   */
  equals(other: MathLayoutRowZipper): boolean {
    const thisEndOffset = this.startAbsoluteOffset + this.value.offsetCount;
    const otherEndOffset = other.startAbsoluteOffset + other.value.offsetCount;
    return this.startAbsoluteOffset === other.startAbsoluteOffset && thisEndOffset === otherEndOffset;
  }

  get type(): MathLayoutRow["type"] {
    return this.value.type;
  }

  get children() {
    let startOffset = this.startAbsoluteOffset;
    return this.value.values.map((v, i) => {
      const childStartOffset = startOffset + 1;
      startOffset = startOffset + v.offsetCount + 1;
      if (isMathLayoutSymbol(v)) {
        return new MathLayoutSymbolZipper(v, this, i, childStartOffset);
      } else if (isMathLayoutTable(v)) {
        return new MathLayoutTableZipper(v, this, i, childStartOffset);
      } else {
        return new MathLayoutContainerZipper(v, this, i, childStartOffset);
      }
    });
  }

  get root(): MathLayoutRowZipper {
    return this.parent?.root ?? this;
  }

  getZipperAtOffset(absoluteOffset: Offset): MathLayoutRowZipper {
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

  insert(offset: Offset, newChild: MathLayoutElement) {
    assert(offset >= 0 && offset <= this.value.values.length, "offset out of range");
    const values = this.value.values.slice();
    values.splice(offset, 0, newChild);

    const newZipper = this.replaceSelf(
      mathLayoutWithWidth({
        type: this.value.type,
        values,
        offsetCount: 0,
      })
    );
    return {
      newRoot: newZipper.root,
      newZipper,
    };
  }

  remove(index: number) {
    assert(index >= 0 && index < this.value.values.length, "index out of range");

    const newZipper = this.replaceSelf(
      mathLayoutWithWidth({
        type: this.value.type,
        values: [...this.value.values.slice(0, index), ...this.value.values.slice(index + 1)],
        offsetCount: 0,
      })
    );
    return {
      newRoot: newZipper.root,
      newZipper,
    };
  }

  /**
   * Mostly internal method, use insert and remove instead
   */
  replaceSelf(newValue: MathLayoutRow) {
    return new MathLayoutRowZipper(
      newValue,
      this.parent?.replaceChild(this.indexInParent, newValue) ?? null,
      this.indexInParent,
      this.startAbsoluteOffset
    );
  }

  /**
   * Mostly internal method, use insert and remove instead
   */
  replaceChild(index: number, newChild: MathLayoutElement): MathLayoutRowZipper {
    assert(index >= 0 && index < this.value.values.length, "index out of range");

    const values = this.value.values.slice();
    values[index] = newChild;
    const newValue: MathLayoutRow = mathLayoutWithWidth({
      type: this.value.type,
      values,
      offsetCount: 0,
    });

    return this.replaceSelf(newValue);
  }
}

export class MathLayoutContainerZipper implements MathLayoutZipper<MathLayoutRowZipper> {
  constructor(
    public readonly value: MathLayoutContainer,
    public readonly parent: MathLayoutRowZipper,
    public readonly indexInParent: number,
    public readonly startAbsoluteOffset: Offset
  ) {}

  get type(): MathLayoutContainer["type"] {
    return this.value.type;
  }

  get children() {
    let startOffset = this.startAbsoluteOffset;
    return this.value.values.map((v, i) => {
      // Different logic here because a container doesn't have extra places for the caret to go
      const childStartOffset = startOffset;
      startOffset = startOffset + v.offsetCount;
      return new MathLayoutRowZipper(v, this, i, childStartOffset);
    });
  }

  get root(): MathLayoutRowZipper {
    return this.parent.root;
  }

  containsAbsoluteOffset(absoluteOffset: Offset): boolean {
    return this.startAbsoluteOffset <= absoluteOffset && absoluteOffset < this.startAbsoluteOffset + this.value.offsetCount;
  }

  replaceSelf(newValue: MathLayoutContainer) {
    return new MathLayoutContainerZipper(
      newValue,
      this.parent?.replaceChild(this.indexInParent, newValue),
      this.indexInParent,
      this.startAbsoluteOffset
    );
  }

  // TODO: lots of almost code duplication, not just the signatures but also the implementation
  replaceChild(index: number, newChild: MathLayoutRow) {
    assert(index >= 0 && index < this.value.values.length, "index out of range");

    const values = this.value.values.slice();
    values[index] = newChild;
    const newValue = mathLayoutWithWidth({
      type: this.value.type,
      values: values as any, // TODO: Type safety would be nice
      offsetCount: 0,
    });

    return this.replaceSelf(newValue);
  }
}

export class MathLayoutTableZipper implements MathLayoutZipper<MathLayoutRowZipper> {
  constructor(
    public readonly value: MathLayoutTable,
    public readonly parent: MathLayoutRowZipper,
    public readonly indexInParent: number,
    public readonly startAbsoluteOffset: Offset
  ) {}

  get type(): MathLayoutTable["type"] {
    return this.value.type;
  }

  get children() {
    let startOffset = this.startAbsoluteOffset;
    return this.value.values.map((v, i) => {
      const childStartOffset = startOffset;
      startOffset = startOffset + v.offsetCount;
      return new MathLayoutRowZipper(v, this, i, childStartOffset);
    });
  }

  get root(): MathLayoutRowZipper {
    return this.parent.root;
  }

  containsAbsoluteOffset(absoluteOffset: Offset): boolean {
    return this.startAbsoluteOffset <= absoluteOffset && absoluteOffset < this.startAbsoluteOffset + this.value.offsetCount;
  }

  replaceSelf(newValue: MathLayoutTable) {
    return new MathLayoutTableZipper(
      newValue,
      this.parent?.replaceChild(this.indexInParent, newValue),
      this.indexInParent,
      this.startAbsoluteOffset
    );
  }

  replaceChild(index: number, newChild: MathLayoutRow) {
    assert(index >= 0 && index < this.value.values.length, "index out of range");

    const values = this.value.values.slice();
    values[index] = newChild;
    const newValue = mathLayoutWithWidth({
      type: this.value.type,
      rowWidth: this.value.rowWidth,
      values: values,
      offsetCount: 0,
    });

    return this.replaceSelf(newValue);
  }
}

export class MathLayoutSymbolZipper implements MathLayoutZipper<never> {
  constructor(
    public readonly value: MathLayoutSymbol,
    public readonly parent: MathLayoutRowZipper,
    public readonly indexInParent: number,
    public readonly startAbsoluteOffset: Offset
  ) {}

  get type(): MathLayoutSymbol["type"] {
    return this.value.type;
  }

  get children() {
    return [];
  }

  get root(): MathLayoutRowZipper {
    return this.parent.root;
  }

  containsAbsoluteOffset(absoluteOffset: Offset): boolean {
    return this.startAbsoluteOffset <= absoluteOffset && absoluteOffset < this.startAbsoluteOffset + this.value.offsetCount;
  }

  replaceSelf(newValue: MathLayoutSymbol) {
    return new MathLayoutSymbolZipper(
      newValue,
      this.parent?.replaceChild(this.indexInParent, newValue),
      this.indexInParent,
      this.startAbsoluteOffset
    );
  }

  replaceChild(index: number, newChild: string) {
    assert(index >= 0 && index < 1, "index out of range");

    const newValue = mathLayoutWithWidth({
      type: this.value.type,
      value: newChild,
      offsetCount: 0,
    });

    return this.replaceSelf(newValue);
  }
}

export type RowIndex = [indexOfContainer: number, indexOfRow: number];

/**
 * Indices of a row in the tree.
 * Order is "-> container -> row"
 */
export type RowIndices = readonly RowIndex[];

/**
 * Gets the indices of the given zipper in the tree.
 * As in, every "indexInParent" of every element that has a parent, including the starting one.
 */
export function getRowIndices(zipper: MathLayoutRowZipper): RowIndices {
  const ancestorIndices: [number, number][] = [];
  let current = zipper;
  while (true) {
    const parent = current.parent;
    if (parent === null) break;

    ancestorIndices.push([parent.indexInParent, current.indexInParent]);
    current = parent.parent;
  }
  ancestorIndices.reverse();
  return ancestorIndices;
}

export function addRowIndex(indices: RowIndices, index: RowIndex | null): RowIndices {
  if (index === null) return indices;
  return indices.concat([index]);
}

export function fromRowIndices(root: MathLayoutRowZipper, indices: RowIndices) {
  let current = root;
  for (let i = 0; i < indices.length; i++) {
    const [firstIndex, secondIndex] = indices[i];

    const child = current.children.at(firstIndex);
    const nextChild = child?.children.at(secondIndex);
    assert(nextChild !== undefined, "Invalid ancestor indices");
    current = nextChild;
  }

  return current;
}

export function getSharedRowIndices(indicesA: RowIndices, indicesB: RowIndices): RowIndices {
  const sharedAncestorIndices: [number, number][] = [];
  for (let i = 0; i < indicesA.length && i < indicesB.length; i++) {
    const a = indicesA[i];
    const b = indicesB[i];
    if (a[0] === b[0] && a[1] === b[1]) {
      sharedAncestorIndices.push([a[0], a[1]]);
    } else {
      break;
    }
  }

  return sharedAncestorIndices;
}
