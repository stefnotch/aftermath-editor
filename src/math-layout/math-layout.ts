/**
 * Merely a Typescript hint to make sure that I don't miss any cases
 */
function typecheckIsNever(_: never) {}

// TODO: Get rid of this, you almost always want a MathLayoutRow instead
export type MathLayout = MathLayoutRow | MathLayoutElement;

// Could be wrapped with interfaces and stuff

/**
 * See Rust for source.
 */
export type MathLayoutRow = {
  readonly type: "row";
  readonly values: readonly MathLayoutElement[];
  /**
   * TODO: Rename to offsetCount
   * If there's one element, then the width is 2.
   * And the offsets are [0, 1].
   * Notice how this gives you an exclusive upper bound.
   */
  readonly width: number;
};

export function isMathLayoutRow(value: MathLayoutRow | MathLayoutElement): value is MathLayoutRow {
  const { type } = value as MathLayoutRow;
  if (type === "row") {
    return true;
  } else {
    typecheckIsNever(type);
    return false;
  }
}

export type MathLayoutElement = MathLayoutContainer | MathLayoutTable | MathLayoutSymbol;
export function isMathLayoutElement(value: MathLayoutRow | MathLayoutElement): value is MathLayoutElement {
  const v = value as MathLayoutElement;
  if (isMathLayoutContainer(v) || isMathLayoutTable(v) || isMathLayoutSymbol(v)) {
    return true;
  } else {
    typecheckIsNever(v);
    return false;
  }
}

export type MathLayoutContainer =
  | {
      readonly type: "fraction";
      readonly values: readonly [MathLayoutRow, MathLayoutRow];
      readonly width: number;
    }
  | {
      readonly type: "root";
      readonly values: readonly [MathLayoutRow, MathLayoutRow];
      readonly width: number;
    }
  | {
      readonly type: "under";
      readonly values: readonly [MathLayoutRow, MathLayoutRow];
      readonly width: number;
    }
  | {
      readonly type: "over";
      readonly values: readonly [MathLayoutRow, MathLayoutRow];
      readonly width: number;
    }
  | {
      readonly type: "sup";
      readonly values: readonly [MathLayoutRow];
      readonly width: number;
    }
  | {
      readonly type: "sub";
      readonly values: readonly [MathLayoutRow];
      readonly width: number;
    };
export function isMathLayoutContainer(value: MathLayoutRow | MathLayoutElement): value is MathLayoutContainer {
  const { type } = value as MathLayoutContainer;
  if (type === "fraction" || type === "root" || type === "under" || type === "over" || type === "sup" || type === "sub") {
    return true;
  } else {
    typecheckIsNever(type);
    return false;
  }
}

export type MathLayoutTable = {
  readonly type: "table";
  readonly rowWidth: number;
  readonly values: MathLayoutRow[];
  readonly width: number;
};
export function isMathLayoutTable(value: MathLayoutRow | MathLayoutElement): value is MathLayoutTable {
  const { type } = value as MathLayoutTable;
  if (type === "table") {
    return true;
  } else {
    typecheckIsNever(type);
    return false;
  }
}

export type MathLayoutSymbol =
  | {
      readonly type: "symbol";
      readonly value: string;
      readonly width: number;
    }
  | {
      readonly type: "error";
      readonly value: string;
      readonly width: number;
    };

export function isMathLayoutSymbol(value: MathLayoutRow | MathLayoutElement): value is MathLayoutSymbol {
  const { type } = value as MathLayoutSymbol;
  if (type === "symbol" || type === "error") {
    return true;
  } else {
    typecheckIsNever(type);
    return false;
  }
}

/*
TODO:
// Things like mpadded or mphantom or styling won't be modeled for now
// sub and sup are a bit special, they "apply" to the element before them
// mmultiscripts won't be modeled for now
 */

// TODO: Placeholder symbol: ⬚

// Parsing maths 101
// Info:
// - Defined variables/functions
// - Defined operators (may overlap with variables)
// Parser:
// Recursive descent

// Minus sign can mean multiple things (infix and prefix)
// Multi character stuff (like == or lim)
// Implicit multiply vs variable name
// dx at the end of an integral
// This stuff happens at the parsing step and doesn't get stored. So, it's possible to first write myF(x) and afterwards define myF
// (tu,ple)
// {s,e,t}
// [ran,ge]
// [ran..ge]
// [matrix]
// |_{lower bound}^{upper bound} after computing an integral
// |abs| and ||norm|| (norm is a separate symbol, in LaTeX it's \Vert)
// 1,2 makes sense in subscripts
// .. and ...
// {a|a in R}, so the bar's meaning depends on the context. But it gets a distinct "tag". And it doesn't have a closing bar.
// does precedence matter? I don't think it does, but maybe there is some mean case where it does...

// Tricky bit,
// > right, so you're not parsing a string so much as you're parsing one tree representation into another one
// > I think there's something like tree grammars but that's definitely more exotic

// \sum_{i=1} (i+j)
// i is the sum's index variable while j is an unbound variable

// Annotated symbols support? (unmatched bracket, colors, ...)

// TODO: Might be an operator
// ⊥  is both a symbol (false) and an operator (A perpendicular B)

// TODO: bracket pairs are to be resolved during inputting (pairs, ghost close bracket, esc and space, set builder |, |abs|, ||norm||, {x| |x| < 3})
