import { assertUnreachable } from "../../utils/assert";

// TODO: Get rid of this, you almost always want a MathLayoutRow instead
export type MathLayout = MathLayoutRow | MathLayoutElement;

/**
 * A simple representation of what a math formula looks like.
 * Optimized for editing, purposefully does not assign meaning to most characters.
 * For instance, if the formula contains "0xe", we just say it has the characters 0, x, e.
 * We don't parse it as a hexadecimal or 0*x*e or anything. That part is done later.
 */
export type MathLayoutRow = {
  /**
   * Rows have an arbitrary number of children
   */
  type: "row";
  values: MathLayoutElement[];
};

export function isMathLayoutRow(value: MathLayoutRow | MathLayoutElement): value is MathLayoutRow {
  const { type } = value as MathLayoutRow;
  if (type === "row") {
    return true;
  }
  assertUnreachable(type);
}

export type MathLayoutElement = MathLayoutContainer | MathLayoutTable | MathLayoutSymbol | MathLayoutText;
export function isMathLayoutElement(value: MathLayoutRow | MathLayoutElement): value is MathLayoutElement {
  const v = value as MathLayoutElement;
  if (isMathLayoutContainer(v) || isMathLayoutTable(v) || isMathLayoutSymbol(v) || isMathLayoutText(v)) {
    return true;
  }
  assertUnreachable(v);
}

/**
 * A container with a fixed number of children
 */
export type MathLayoutContainer =
  | {
      /**
       * $\frac{a}{b}$
       */
      type: "fraction";
      values: [MathLayoutRow, MathLayoutRow];
    }
  | {
      /**
       * $\sqrt[a]{b}$
       */
      type: "root";
      values: [MathLayoutRow, MathLayoutRow];
    }
  | {
      /**
       * $\underset{b}{a}$
       */
      type: "under";
      values: [MathLayoutRow, MathLayoutRow];
    }
  | {
      /**
       * $\overset{b}{a}$
       */
      type: "over";
      values: [MathLayoutRow, MathLayoutRow];
    }
  | {
      /**
       * $^a$
       */
      type: "sup";
      values: [MathLayoutRow];
    }
  | {
      /**
       * $_a$
       */
      type: "sub";
      values: [MathLayoutRow];
    };
export function isMathLayoutContainer(value: MathLayoutRow | MathLayoutElement): value is MathLayoutContainer {
  const { type } = value as MathLayoutContainer;
  if (type === "fraction" || type === "root" || type === "under" || type === "over" || type === "sup" || type === "sub") {
    return true;
  }
  assertUnreachable(type);
}

/**
 * A table with an arbitrary number of children
 */
export type MathLayoutTable = {
  /**
   * A rectangular table. Every cell is a row.
   * $\begin{matrix}a&b\\c&d\end{matrix}$
   */
  type: "table";
  width: number;
  values: MathLayoutRow[];
};
export function isMathLayoutTable(value: MathLayoutRow | MathLayoutElement): value is MathLayoutTable {
  const { type } = value as MathLayoutTable;
  if (type === "table") {
    return true;
  }
  assertUnreachable(type);
}

/**
 * Symbols without children
 */
export type MathLayoutSymbol =
  | {
      /**
       * A single symbol
       */
      type: "symbol";
      value: string;
    }
  | {
      /**
       * TODO: Maybe add info about "is opening" and "is closing" bracket.
       * A bracket symbol, with special handling.
       * Brackets are not containers, because that makes things like adding a closing bracket somewhere in a formula really awkward.
       */
      type: "bracket";
      value: string;
    };

export function isMathLayoutSymbol(value: MathLayoutRow | MathLayoutElement): value is MathLayoutSymbol {
  const { type } = value as MathLayoutSymbol;
  if (type === "symbol" || type === "bracket") {
    return true;
  }
  assertUnreachable(type);
}

/**
 * Text without children, can be edited
 */
export type MathLayoutText =
  | {
      /**
       * A single bit of text.
       * $\text{a}$
       */
      type: "text";
      value: string;
    }
  | {
      /**
       * Error message, used whenever the parser encounters something it doesn't understand.
       */
      type: "error";
      value: string;
    };
export function isMathLayoutText(value: MathLayoutRow | MathLayoutElement): value is MathLayoutText {
  const { type } = value as MathLayoutText;
  if (type === "text" || type === "error") {
    return true;
  }
  assertUnreachable(type);
}

/*
TODO:
// Things like mpadded or mphantom or styling won't be modeled for now
// sub and sup are a bit special, they "apply" to the element before them
// mmultiscripts won't be modeled for now
 */

// TODO: Placeholder symbol: ⬚
// TODO:Canoical symbol form (like when there are multiple unicode characters or when some HTML escape has been used &lt;)

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

// Oh no,
// > right, so you're not parsing a string so much as you're parsing one tree representation into another one
// > I think there's something like tree grammars but that's definitely more exotic

// \sum_{i=1} (i+j)
// i is the sum's index variable while j is an unbound variable

// Annotated symbols support? (unmatched bracket, colors, ...)

// TODO: bracket pairs are to be resolved during inputting (pairs, ghost close bracket, esc and space, set builder |, |abs|, ||norm||, {x| |x| < 3})

// The index has a different meaning depending on the element (child index, ignored, text index, 2D index)
export type MathPhysicalLayout = Map<
  MathLayoutRow | MathLayoutText, // row-container
  (index: number) => { x: number; y: number; height: number }
>;
