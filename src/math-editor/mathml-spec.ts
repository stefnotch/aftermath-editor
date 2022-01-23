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

// Source: https://stackoverflow.com/a/22015930/3492994
function zipWith<T>(a: T[], b: T[]) {
  return Array.from(Array(Math.max(a.length, b.length)), (v, i) => [a[i], b[i]]);
}

const parseUnicode = (v: string) => String.fromCodePoint(parseInt(v.trim().replace(/U\+([a-zA-Z0-9]+)/, "$1"), 16));

export const startingBrackets = new Map<string, string>(bracketsList);

export const ambigousBrackets = new Map<string, string>(ambigousBracketsList);

export const endingBrackets = new Map<string, string>(bracketsList.map(([key, value]) => [value, key]));

export const allBrackets = new Set<string>([...bracketsList.flat(), ...ambigousBracketsList.flat()]);
