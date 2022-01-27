// Time to try out the "IR" approach
// Things like mpadded or mphantom or styling won't be modeled for now
// sub and sup are a bit special, they "apply" to the element before them
// mmultiscripts won't be modeled for now

// hm, having a "parent" link would be super useful. I'll get to that later

// a caret basically points at some position in the tree

// Placeholder symbol: ⬚
// Canoical symbol form (like when there are multiple unicode characters or when some HTML escape has been used &lt;)

// Brackets question: sub-tree or nah? (includes |abs|)
// if subtree: brackets stop being symbols, instead you can place the caret outside of the brackets and then there is another expression (usually row) inside them
// if not subtree: we need to find the ending bracket. which means that in the case of |abs|, we need to wrap it in its own row. and when |abs| gets deleted or edited, we gotta get rid of the useless row

/**
 * A simple, JSON-compatible representation of a math formula.
 * Optimized for editing, purposefully does not assign meaning to most characters.
 * For instance, if the formula contains "0xe", we just say it has the characters 0, x, e.
 * We don't parse it as a hexadecimal or 0*x*e or anything. That part is done later.
 */
export type MathIR = MathIRRow | MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf;

export type MathIRContainer =
  | {
      type: "frac";
      values: [MathIRRow, MathIRRow];
    }
  | {
      type: "root";
      values: [MathIRRow, MathIRRow];
    }
  | {
      type: "under";
      values: [MathIRRow, MathIRRow];
    }
  | {
      type: "over";
      values: [MathIRRow, MathIRRow];
    }
  | {
      type: "sup";
      values: [MathIRRow];
    }
  | {
      type: "sub";
      values: [MathIRRow];
    }
  | {
      // rows and cells
      // Not sure about this one yet
      type: "table";
      values: MathIRRow[][];
    };

export type MathIRRow = {
  // the only thing that has an arbitrary number of children
  type: "row";
  values: (MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf)[];
};

export type MathIRSymbolLeaf =
  | {
      // A bracket symbol
      // Brackets are not containers, cause that makes things like adding a closing bracket somewhere in a formula really awkward
      type: "bracket";
      value: string;
    }
  | {
      // a single symbol
      type: "symbol";
      // used to disambiguate between different uses of the same symbol
      name?: string;
      wikidata?: string;
      value: string;
    };

export type MathIRTextLeaf =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "error";
      value: string;
    };

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

// Annotated symbols support? (unmatched bracket, colors, ...)

// TODO: bracket pairs are to be resolved during inputting (pairs, ghost close bracket, esc and space, set builder |, |abs|, ||norm||, {x| |x| < 3})

// The index has a different meaning depending on the element (child index, ignored, text index, 2D index)
export type MathIRLayout = Map<
  MathIRRow | MathIRTextLeaf, // row-container
  (index: number) => { x: number; y: number; height: number }
>;
