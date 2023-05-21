export type MathMLTags =
  | "math"
  | "semantics"
  | "annotation"
  | "annotation-xml"
  | "mtext"
  | "mi"
  | "mn"
  | "mo"
  | "mspace"
  | "ms"
  | "mrow"
  | "mfrac"
  | "msqrt"
  | "mroot"
  | "mstyle"
  | "merror"
  | "maction"
  | "mpadded"
  | "mphantom"
  | "msub"
  | "msup"
  | "msubsup"
  | "munder"
  | "mover"
  | "munderover"
  | "mmultiscripts"
  | "none"
  | "mprescripts"
  | "mtable"
  | "mtr"
  | "mtd";

/**
 * How many children are expected for each MathML tag.
 * null means any number of children is allowed.
 *
 * Note that MathML itself doesn't place any restrictions on the number of children, but we do.
 */
export const MathMLTagsExpectedChildrenCount: Record<MathMLTags, number | null> = {
  math: null,
  semantics: "TODO:" as any as number,
  annotation: "TODO:" as any as number,
  "annotation-xml": "TODO:" as any as number,
  mtext: "TODO:" as any as number,
  mi: "TODO:" as any as number,
  mn: "TODO:" as any as number,
  mo: "TODO:" as any as number,
  mspace: "TODO:" as any as number,
  ms: "TODO:" as any as number,
  mrow: null,
  mfrac: 2,
  msqrt: "TODO:" as any as number,
  mroot: 2,
  mstyle: "TODO:" as any as number,
  merror: null,
  maction: "TODO:" as any as number,
  mpadded: "TODO:" as any as number,
  mphantom: "TODO:" as any as number,
  msub: 2,
  msup: 2,
  msubsup: "TODO:" as any as number,
  munder: 2,
  mover: 2,
  munderover: "TODO:" as any as number,
  mmultiscripts: "TODO:" as any as number,
  none: "TODO:" as any as number,
  mprescripts: "TODO:" as any as number,
  mtable: null,
  mtr: null,
  mtd: null,
};

// See https://www.w3.org/TR/mathml-core/#operator-dictionary
// https://github.com/w3c/mathml-core/issues/112
const bracketsList: [string, string][] = [
  ["(", ")"], // U+0028, U+0029
  ["[", "]"], // U+005B, U+005D
  ["{", "}"], // U+007B, U+007D
  ["⌈", "⌉"], // U+2308, U+2309
  ["⌊", "⌋"], // U+230A, U+230B
  ["〈", "〉"], // U+2329, U+232A
  ["❲", "❳"], // U+2772, U+2773
  ["⟦", "⟧"], // U+27E6, U+27E7
  ["⟨", "⟩"], // U+27E8, U+27E9
  ["⟪", "⟫"], // U+27EA, U+27EB
  ["⟬", "⟭"], // U+27EC, U+27ED
  ["⟮", "⟯"], // U+27EE, U+27EF
  ["⦃", "⦄"], // U+2983, U+2984
  ["⦅", "⦆"], // U+2985, U+2986
  ["⦇", "⦈"], // U+2987, U+2988
  ["⦉", "⦊"], // U+2989, U+298A
  ["⦋", "⦌"], // U+298B, U+298C
  ["⦍", "⦎"], // U+298D, U+298E
  ["⦏", "⦐"], // U+298F, U+2990
  ["⦑", "⦒"], // U+2991, U+2992
  ["⦓", "⦔"], // U+2993, U+2994
  ["⦕", "⦖"], // U+2995, U+2996
  ["⦗", "⦘"], // U+2997, U+2998
  ["⧘", "⧙"], // U+29D8, U+29D9
  ["⧚", "⧛"], // U+29DA, U+29DB
  ["⧼", "⧽"], // U+29FC, U+29FD
];
const ambigousBracketsList: [string, string][] = [
  ["|", "|"], // U+007C, U+007C
  ["‖", "‖"], // U+2016, U+2016
  ["⦀", "⦀"], // U+2980, U+2980
  ["⦙", "⦙"], // U+2999, U+2999
];

// @ts-ignore
const parseUnicode = (v: string) => String.fromCodePoint(parseInt(v.trim().replace(/U\+([a-zA-Z0-9]+)/, "$1"), 16));

export const startingBrackets = new Map<string, string>(bracketsList);

export const ambigousBrackets = new Map<string, string>(ambigousBracketsList);

export const endingBrackets = new Map<string, string>(bracketsList.map(([key, value]) => [value, key]));

export const allBrackets = new Set<string>([...bracketsList.flat(), ...ambigousBracketsList.flat()]);
