import { MathLayout, MathLayoutContainer, MathLayoutRow, MathLayoutSymbol, MathLayoutText } from "./math-editor/math-layout";

/**
 * A red-green tree: https://blog.yaakov.online/red-green-trees/
 */
export class MathLayoutZipper<T extends MathLayout> {
  readonly value: T;

  // TODO: Improve the parent type
  readonly parent: MathLayoutZipper<MathLayoutRow> | MathLayoutZipper<MathLayoutContainer> | null;
  constructor(value: T, parent: MathLayoutZipper<MathLayoutRow> | MathLayoutZipper<MathLayoutContainer> | null) {
    this.value = value;
    this.parent = parent;
  }

  get type(): T["type"] {
    return this.value.type;
  }

  get children(): T extends MathLayoutSymbol | MathLayoutText
    ? []
    : T extends MathLayoutRow
    ? (MathLayoutZipper<MathLayoutContainer> | MathLayoutZipper<MathLayoutSymbol> | MathLayoutZipper<MathLayoutText>)[]
    : T extends MathLayout & { type: "table" }
    ? MathLayoutZipper<MathLayoutRow>[][]
    : MathLayoutZipper<MathLayoutRow>[] {
    const v = this.value;
    const t = v.type;
    return t == "bracket" || t == "symbol" || t == "error" || t == "text"
      ? []
      : t == "row"
      ? v.values.map((x) => new MathLayoutZipper(x, this as any))
      : t == "table"
      ? v.values.map((vv) => vv.map((x) => new MathLayoutZipper(x, this as any)))
      : (v.values.map((x) => new MathLayoutZipper(x, this as any)) as any);
  }
}

// Alternative impl
interface MathLayoutZipperX {
  type: string;
}

export class MathLayoutRowZipper implements MathLayoutZipperX {
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

export class MathLayoutContainerZipper implements MathLayoutZipperX {
  constructor(public readonly value: MathLayoutContainer, public readonly parent: MathLayoutRowZipper) {}
  get type(): MathLayoutContainer["type"] {
    return this.value.type;
  }
  get children() {
    return this.value.values.map((v) => new MathLayoutRowZipper(v, this));
  }
}
export class MathLayoutSymbolZipper implements MathLayoutZipperX {
  constructor(public readonly value: MathLayoutSymbol, public readonly parent: MathLayoutRowZipper) {}
  get type(): MathLayoutSymbol["type"] {
    return this.value.type;
  }
}
export class MathLayoutTextZipper implements MathLayoutZipperX {
  constructor(public readonly value: MathLayoutText, public readonly parent: MathLayoutRowZipper) {}
  get type(): MathLayoutText["type"] {
    return this.value.type;
  }
}
