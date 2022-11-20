import { TokenStream } from "../math-editor/token-stream";
import { assert } from "../utils/assert";
import {
  MathLayoutRow,
  MathLayoutContainer,
  MathLayoutTable,
  MathLayoutSymbol,
  MathLayoutText,
  isMathLayoutSymbol,
  isMathLayoutText,
  isMathLayoutTable,
  MathLayoutElement,
} from "./math-layout";
import { Offset } from "./math-layout-offset";

/**
 * A red-green tree: https://blog.yaakov.online/red-green-trees/
 * A zipper is a pointer to a node in a tree, with a reference to the parent node.
 * See also: http://learnyouahaskell.com/zippers
 */
interface MathLayoutZipper {
  readonly type: MathLayoutRow["type"] | MathLayoutElement["type"];
  readonly root: MathLayoutRowZipper;
  readonly indexInParent: number;
  equals(other: MathLayoutZipper): boolean;
}

/**
 * TODO:
For a full implementation, we would still need some further details such as:

    Equality and HashCode overrides so that two identical RedNode<T>s are considered equal.
    Utility methods to easily replace part of a RedGreenTree<T>, which would return a new RedGreenTree<T> (since they're immutable) sharing the remaining nodes with the old tree object.

    TODO: Performance maybe
    https://github.com/KirillOsenkov/Bliki/wiki/Roslyn-Immutable-Trees
 */

type ZipperInstance = MathLayoutZipper & { value: MathLayoutRow | MathLayoutElement; parent: ZipperInstance | null };

export class MathLayoutRowZipper implements MathLayoutZipper {
  constructor(
    public readonly value: MathLayoutRow,
    public readonly parent: MathLayoutContainerZipper | MathLayoutTableZipper | null,
    public readonly indexInParent: number
  ) {}

  equals<T extends ZipperInstance>(other: T): boolean {
    return zippersEqual(this, other);
  }

  get type(): MathLayoutRow["type"] {
    return this.value.type;
  }

  get children() {
    return this.value.values.map((v, i) => {
      if (isMathLayoutSymbol(v)) {
        return new MathLayoutSymbolZipper(v, this, i);
      } else if (isMathLayoutText(v)) {
        return new MathLayoutTextZipper(v, this, i);
      } else if (isMathLayoutTable(v)) {
        return new MathLayoutTableZipper(v, this, i);
      } else {
        return new MathLayoutContainerZipper(v, this, i);
      }
    });
  }

  get childrenStream() {
    return new TokenStream(this.children, 0);
  }

  get root(): MathLayoutRowZipper {
    return this.parent?.root ?? this;
  }

  insert(offset: Offset, newChild: MathLayoutElement) {
    assert(offset >= 0 && offset <= this.value.values.length, "offset out of range");
    const values = this.value.values.slice();
    values.splice(offset, 0, newChild);

    const newZipper = this.replaceSelf({
      type: this.value.type,
      values,
    });
    return {
      newRoot: newZipper.root,
      newZipper,
    };
  }

  remove(index: number) {
    assert(index >= 0 && index < this.value.values.length, "index out of range");

    const newZipper = this.replaceSelf({
      type: this.value.type,
      values: [...this.value.values.slice(0, index), ...this.value.values.slice(index + 1)],
    });
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
      this.indexInParent
    );
  }

  /**
   * Mostly internal method, use insert and remove instead
   */
  replaceChild(index: number, newChild: MathLayoutElement): MathLayoutRowZipper {
    assert(index >= 0 && index < this.value.values.length, "index out of range");

    const values = this.value.values.slice();
    values[index] = newChild;
    const newValue: MathLayoutRow = {
      type: this.value.type,
      values,
    };

    return new MathLayoutRowZipper(
      newValue,
      this.parent?.replaceChild(this.indexInParent, newValue) ?? null,
      this.indexInParent
    );
  }
}

export class MathLayoutContainerZipper implements MathLayoutZipper {
  constructor(
    public readonly value: MathLayoutContainer,
    public readonly parent: MathLayoutRowZipper,
    public readonly indexInParent: number
  ) {}

  equals<T extends ZipperInstance>(other: T): boolean {
    return zippersEqual(this, other);
  }

  get type(): MathLayoutContainer["type"] {
    return this.value.type;
  }

  get children() {
    return this.value.values.map((v, i) => new MathLayoutRowZipper(v, this, i));
  }

  get childrenStream() {
    return new TokenStream(this.children, 0);
  }

  get root(): MathLayoutRowZipper {
    return this.parent.root;
  }

  replaceSelf(newValue: MathLayoutContainer) {
    return new MathLayoutContainerZipper(newValue, this.parent?.replaceChild(this.indexInParent, newValue), this.indexInParent);
  }

  // TODO: lots of almost code duplication, not just the signatures but also the implementation
  replaceChild(index: number, newChild: MathLayoutRow) {
    assert(index >= 0 && index < this.value.values.length, "index out of range");

    const values = this.value.values.slice();
    values[index] = newChild;
    const newValue: MathLayoutContainer = {
      type: this.value.type,
      values: values as any, // TODO: Type safety would be nice
    };

    return new MathLayoutContainerZipper(newValue, this.parent?.replaceChild(this.indexInParent, newValue), this.indexInParent);
  }
}

export class MathLayoutTableZipper implements MathLayoutZipper {
  constructor(
    public readonly value: MathLayoutTable,
    public readonly parent: MathLayoutRowZipper,
    public readonly indexInParent: number
  ) {}

  equals<T extends ZipperInstance>(other: T): boolean {
    return zippersEqual(this, other);
  }

  get type(): MathLayoutTable["type"] {
    return this.value.type;
  }

  get children() {
    return this.value.values.map((v, i) => new MathLayoutRowZipper(v, this, i));
  }

  get childrenStream() {
    return new TokenStream(this.children, 0);
  }

  get root(): MathLayoutRowZipper {
    return this.parent.root;
  }

  replaceSelf(newValue: MathLayoutTable) {
    return new MathLayoutTableZipper(newValue, this.parent?.replaceChild(this.indexInParent, newValue), this.indexInParent);
  }

  replaceChild(index: number, newChild: MathLayoutRow) {
    assert(index >= 0 && index < this.value.values.length, "index out of range");

    const values = this.value.values.slice();
    values[index] = newChild;
    const newValue: MathLayoutTable = {
      type: this.value.type,
      width: this.value.width,
      values: values,
    };

    return new MathLayoutTableZipper(newValue, this.parent?.replaceChild(this.indexInParent, newValue), this.indexInParent);
  }
}

export class MathLayoutSymbolZipper implements MathLayoutZipper {
  constructor(
    public readonly value: MathLayoutSymbol,
    public readonly parent: MathLayoutRowZipper,
    public readonly indexInParent: number
  ) {}

  equals<T extends ZipperInstance>(other: T): boolean {
    return zippersEqual(this, other);
  }

  get type(): MathLayoutSymbol["type"] {
    return this.value.type;
  }

  get root(): MathLayoutRowZipper {
    return this.parent.root;
  }

  replaceSelf(newValue: MathLayoutSymbol) {
    return new MathLayoutSymbolZipper(newValue, this.parent?.replaceChild(this.indexInParent, newValue), this.indexInParent);
  }

  replaceChild(index: number, newChild: string) {
    assert(index >= 0 && index < 1, "index out of range");

    const newValue: MathLayoutSymbol = {
      type: this.value.type,
      value: newChild,
    };

    return new MathLayoutSymbolZipper(newValue, this.parent?.replaceChild(this.indexInParent, newValue), this.indexInParent);
  }
}

export class MathLayoutTextZipper implements MathLayoutZipper {
  constructor(
    public readonly value: MathLayoutText,
    public readonly parent: MathLayoutRowZipper,
    public readonly indexInParent: number
  ) {}

  equals<T extends ZipperInstance>(other: T): boolean {
    return zippersEqual(this, other);
  }

  get type(): MathLayoutText["type"] {
    return this.value.type;
  }

  get root(): MathLayoutRowZipper {
    return this.parent.root;
  }

  insert(offset: Offset, newChild: string) {
    assert(offset >= 0 && offset <= this.value.value.length, "offset out of range");
    const newZipper = this.replaceSelf({
      type: this.value.type,
      value: this.value.value.slice(0, offset) + newChild + this.value.value.slice(offset),
    });
    return {
      newRoot: newZipper.root,
      newZipper: newZipper,
    };
  }

  remove(index: number) {
    assert(index >= 0 && index < this.value.value.length, "index out of range");

    const newZipper = this.replaceSelf({
      type: this.value.type,
      value: this.value.value.slice(0, index) + this.value.value.slice(index + 1),
    });
    return {
      newRoot: newZipper.root,
      newZipper: newZipper,
    };
  }

  replaceSelf(newValue: MathLayoutText) {
    return new MathLayoutTextZipper(newValue, this.parent?.replaceChild(this.indexInParent, newValue), this.indexInParent);
  }

  replaceChild(index: number, newChild: string) {
    assert(index >= 0 && index < this.value.value.length, "index out of range");

    const newValue: MathLayoutText = {
      type: this.value.type,
      value: this.value.value.substring(0, index) + newChild + this.value.value.substring(index + 1),
    };

    return new MathLayoutTextZipper(newValue, this.parent?.replaceChild(this.indexInParent, newValue), this.indexInParent);
  }
}

function zippersEqual<T extends ZipperInstance, U extends ZipperInstance>(a: T, b: U): boolean {
  if (b.type !== a.type) return false;
  if (a.value !== b.value) return false;
  if (a.parent === null || b.parent === null) return a.parent === b.parent;
  return a.parent.equals(b.parent);
}

export function getAncestors(zipper: MathLayoutRowZipper | MathLayoutTextZipper) {
  const ancestors: (MathLayoutRow | MathLayoutElement)[] = [];
  let current: MathLayoutRowZipper | MathLayoutTextZipper | MathLayoutContainerZipper | MathLayoutTableZipper = zipper;
  while (true) {
    ancestors.push(current.value);
    if (current.parent === null) {
      break;
    } else {
      current = current.parent;
    }
  }
  ancestors.reverse();
  return ancestors;
}

/**
 * Indices of a row or text in the tree.
 * The first index is where in the root one should go.
 * The second index is where in the first child one should go, etc.
 * The last index is where in the last child one should go to find the row or text.
 */
export type AncestorIndices = readonly number[];

/**
 * Gets the indices of the given zipper in the tree.
 * As in, every "indexInParent" of every element that has a parent, including the starting one.
 */
export function getAncestorIndices(zipper: MathLayoutRowZipper | MathLayoutTextZipper): AncestorIndices {
  const ancestorIndices: number[] = [];
  let current: MathLayoutRowZipper | MathLayoutTextZipper | MathLayoutContainerZipper | MathLayoutTableZipper = zipper;
  while (current.parent !== null) {
    ancestorIndices.push(current.indexInParent);
    current = current.parent;
  }
  ancestorIndices.reverse();
  return ancestorIndices;
}

export function fromAncestorIndices(root: MathLayoutRowZipper, ancestorIndices: AncestorIndices) {
  // TODO: use satisfies
  let current = root as MathLayoutRowZipper | MathLayoutContainerZipper | MathLayoutTableZipper;
  for (const index of ancestorIndices) {
    const child = current.children[index];
    if (child.type === "symbol" || child.type === "bracket") {
      throw new Error("Cannot get a symbol or bracket from ancestor indices");
    } else if (child.type === "error" || child.type === "text") {
      return child;
    } else {
      assert(!(child instanceof MathLayoutSymbolZipper) && !(child instanceof MathLayoutTextZipper));
      current = child;
    }
  }

  assert(current instanceof MathLayoutRowZipper || current instanceof MathLayoutTextZipper);
  return current;
}
