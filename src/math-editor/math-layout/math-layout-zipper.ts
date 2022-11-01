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
 */
interface MathLayoutZipper {
  readonly type: string;
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

function zippersEqual<T extends ZipperInstance, U extends ZipperInstance>(a: T, b: U): boolean {
  if (b.type !== a.type) return false;
  if (a.value !== b.value) return false;
  if (a.parent === null || b.parent === null) return a.parent === b.parent;
  return a.parent.equals(b.parent);
}

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
}

// Unsure if this is already good enough or if we need more stuff for navigating within a table
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
