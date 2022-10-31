import {
  MathLayoutRow,
  MathLayoutContainer,
  MathLayoutTable,
  MathLayoutSymbol,
  MathLayoutText,
  isMathLayoutSymbol,
  isMathLayoutText,
  isMathLayoutTable,
} from "./math-layout";

/**
 * A red-green tree: https://blog.yaakov.online/red-green-trees/
 */
interface MathLayoutZipper {
  type: string;
}
/**
 * TODO:
For a full implementation, we would still need some further details such as:

    Equality and HashCode overrides so that two identical RedNode<T>s are considered equal.
    Utility methods to easily replace part of a RedGreenTree<T>, which would return a new RedGreenTree<T> (since they're immutable) sharing the remaining nodes with the old tree object.

 */

export class MathLayoutRowZipper implements MathLayoutZipper {
  constructor(
    public readonly value: MathLayoutRow,
    public readonly parent: MathLayoutContainerZipper | MathLayoutTableZipper | null
  ) {}

  get type(): MathLayoutRow["type"] {
    return this.value.type;
  }
  get children() {
    return this.value.values.map((v) => {
      if (isMathLayoutSymbol(v)) {
        return new MathLayoutSymbolZipper(v, this);
      } else if (isMathLayoutText(v)) {
        return new MathLayoutTextZipper(v, this);
      } else if (isMathLayoutTable(v)) {
        return new MathLayoutTableZipper(v, this);
      } else {
        return new MathLayoutContainerZipper(v, this);
      }
    });
  }
}

export class MathLayoutContainerZipper implements MathLayoutZipper {
  constructor(public readonly value: MathLayoutContainer, public readonly parent: MathLayoutRowZipper) {}

  get type(): MathLayoutContainer["type"] {
    return this.value.type;
  }

  get children() {
    return this.value.values.map((v) => new MathLayoutRowZipper(v, this));
  }
}

// Unsure if this is already good enough or if we need more stuff for navigating within a table
export class MathLayoutTableZipper implements MathLayoutZipper {
  constructor(public readonly value: MathLayoutTable, public readonly parent: MathLayoutRowZipper) {}

  get type(): MathLayoutTable["type"] {
    return this.value.type;
  }

  get children() {
    return this.value.values.map((v) => new MathLayoutRowZipper(v, this));
  }
}

export class MathLayoutSymbolZipper implements MathLayoutZipper {
  constructor(public readonly value: MathLayoutSymbol, public readonly parent: MathLayoutRowZipper) {}

  get type(): MathLayoutSymbol["type"] {
    return this.value.type;
  }
}

// Unsure if this is already good enough or if we need more stuff for navigating within text
export class MathLayoutTextZipper implements MathLayoutZipper {
  constructor(public readonly value: MathLayoutText, public readonly parent: MathLayoutRowZipper) {}

  get type(): MathLayoutText["type"] {
    return this.value.type;
  }
}
