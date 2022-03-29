import { MathLayout, MathLayoutContainer, MathLayoutRow, MathLayoutSymbol, MathLayoutText } from "./math-layout";

/**
 * A red-green tree: https://blog.yaakov.online/red-green-trees/
 */
interface MathLayoutZipper {
  type: string;
}

export class MathLayoutRowZipper implements MathLayoutZipper {
  constructor(public readonly value: MathLayoutRow, public readonly parent: MathLayoutContainerZipper | null) {}
  get type(): MathLayoutRow["type"] {
    return this.value.type;
  }
  get children() {
    return this.value.values.map((v) =>
      v.type == "bracket" || v.type == "symbol"
        ? new MathLayoutSymbolZipper(v, this)
        : v.type == "text" || v.type == "error"
        ? new MathLayoutTextZipper(v, this)
        : new MathLayoutContainerZipper(v, this)
    );
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
export class MathLayoutSymbolZipper implements MathLayoutZipper {
  constructor(public readonly value: MathLayoutSymbol, public readonly parent: MathLayoutRowZipper) {}
  get type(): MathLayoutSymbol["type"] {
    return this.value.type;
  }
}
export class MathLayoutTextZipper implements MathLayoutZipper {
  constructor(public readonly value: MathLayoutText, public readonly parent: MathLayoutRowZipper) {}
  get type(): MathLayoutText["type"] {
    return this.value.type;
  }
}
