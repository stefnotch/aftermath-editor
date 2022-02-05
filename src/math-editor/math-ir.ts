import { MathLayout } from "./math-layout";

// See https://cortexjs.io/math-json/
// See https://github.com/cortex-js/compute-engine/blob/main/src/math-json/math-json-format.ts

/**
 * A proper abstract syntax tree for mathematics.
 * > where every node on all levels also stores its extent as a range: Sounds interesting, a parent node's range would be [min(child ranges.from  )..max(child ranges.to)]
 *
 */
export type MathIR = {
  type: string;
  arguments: any;
  mathLayout: MathLayout[]; // Original tokens
};

// ["Decimal", string] | ["Variable", string] | ["Text", string] | ["ApplyFunction", MathIR, MathIR];

// TODO:
// If we have a math-layout with a bunch of symbols
// We want to know
// - Is the element at this position a number (mi)
// - Is the element at this position an operator (mo)
// - Is the element at this position a variable (mi)
// - Is the element at this position a function (mi)
// - What "range" does the element at this position have (multiple digits, lim)
// => Map<MathLayout, MathJson>
//    and to figure out the range, we check if adjacent MathLayout elements refer to the same MathJson object

// - Which "definition" does the element at this position have (hover text: data type, comments, function arguments, preferred color and extra styling)

// - Find all elements with a given "definition" (document highlights, find references, refactor-rename)

// - Which operators/variables/functions are defined at this position (autocomplete)
// => Reparse and return that info

// - Round-tripping conversion (Invariant for converters: MathLayout => anything => same MathLayout)
// => Being able to convert MathJson back into MathLayout. For example, simplify an expression and display that.

// - Language server features https://code.visualstudio.com/api/language-extensions/language-server-extension-guide#additional-language-server-features
// So basically
// parse(mathLayout): { transformedInto: Map<MathLayout, MathIR>, mathIR: MathIR }
