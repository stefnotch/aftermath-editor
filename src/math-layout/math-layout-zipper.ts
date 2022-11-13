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

/**
 * A red-green tree: https://blog.yaakov.online/red-green-trees/
 * A zipper is a pointer to a node in a tree, with a reference to the parent node.
 * See also: http://learnyouahaskell.com/zippers
 */
interface MathLayoutZipper {
  readonly type: MathLayoutRow["type"] | MathLayoutElement["type"];
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
export type AncestorIndices = number[];

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
