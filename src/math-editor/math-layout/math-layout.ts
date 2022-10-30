export type MathLayout = MathLayoutRow | MathLayoutContainer | MathLayoutSymbol | MathLayoutText;

export type MathLayoutRow = {
  type: "row";
  values: (MathLayoutContainer | MathLayoutSymbol | MathLayoutText)[];
};

export type MathLayoutContainer =
  | {
      type: "frac";
      values: [MathLayoutRow, MathLayoutRow];
    }
  | {
      type: "root";
      values: [MathLayoutRow, MathLayoutRow];
    }
  | {
      type: "under";
      values: [MathLayoutRow, MathLayoutRow];
    }
  | {
      type: "over";
      values: [MathLayoutRow, MathLayoutRow];
    }
  | {
      type: "sup";
      values: [MathLayoutRow];
    }
  | {
      type: "sub";
      values: [MathLayoutRow];
    }
  | MathLayoutTable;

export type MathLayoutTable = {
  type: "table";
  width: number;
  values: MathLayoutRow[];
};

export type MathLayoutSymbol =
  | {
      type: "bracket";
      value: string;
    }
  | {
      type: "symbol";
      value: string;
    };

export type MathLayoutText =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "error";
      value: string;
    };

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
