import { assert } from "../assert";
import { MathLayout, MathLayoutContainer, MathLayoutRow, MathLayoutSymbol, MathLayoutText } from "./math-layout/math-layout";
import { TokenStream } from "./token-stream";
import { isSame as isSameMathLayout } from "./math-layout/math-layout-utils";

// A highly constrained version of MathJson
// See https://cortexjs.io/math-json/
// See https://github.com/cortex-js/compute-engine/blob/main/src/math-json/math-json-format.ts

/**
 * This diverges from the mathjson format by not allowing
 * - NaN
 * - Infinity
 * - Suffixes such as n or d
 */
export type MathJsonNumber = {
  num: string;
};
export type MathJsonString = {
  str: string;
};
export type MathJsonDictionary = {
  dict: { [key: string]: MathJson };
};
export type MathJsonSymbol = {
  sym: string;
};
export type MathJson =
  // Arbitrary numbers with a decimal point
  | MathJsonNumber
  // Text
  | MathJsonString
  // Dictionaries
  | MathJsonDictionary
  // Symbols
  | MathJsonSymbol
  // Apply a function (head) to some arguments (tail)
  | MathJson[]
  | [string, ...MathJson[]];

/**
 * Interesting information about a given symbol.
 *
 * Note:
 * - Constants are functions with zero arguments
 * - Relations are functions with multiple arguments and a boolean return value
 */
export type MathDefinition = {
  documentation: MathJsonString;
  // Domains: https://cortexjs.io/compute-engine/reference/domains/
  // We need domains for units
  argumentDomains: MathJson[];
  returnDomain: MathJson;
};

// Road forward for now
// 1. Don't parse sums, derivatives, integrals, etc
// 2. Just parse the simple token stuff
// 3. Worry about the harder things later
/*
1. Take the largest token match
2. If there are multiple, equally fine definitions, pick the one with the preferred bindingPowers
3. Apply various extra rules (like deciding that a lim token followed by "sup" turns into "limsup")
4. If nothing matched, apply the default rules (like turning a frac into a fraction)

I'm not certain about the orde of step 3 and 4 yet, but it doesn't matter.

Partial functions are supported. So, if `++` is a concat operator, and `+` is a prefix operator...then `(++x)` will be parsed as ["++", "Missing", "x"]. Which is a beautiful partial function!
To use `+` as a prefix operator, you have to use spaces `+ +x`.
*/

function isAtom(definition: MathParseDefinition): definition is MathParseDefinition & { bindingPower: [null, null] } {
  return definition.bindingPower[0] == null && definition.bindingPower[1] == null;
}
function isPrefix(definition: MathParseDefinition): definition is MathParseDefinition & { bindingPower: [null, number] } {
  return definition.bindingPower[0] == null && definition.bindingPower[1] != null;
}
function isInfix(definition: MathParseDefinition): definition is MathParseDefinition & { bindingPower: [number, number] } {
  return definition.bindingPower[0] != null && definition.bindingPower[1] != null;
}
function isPostfix(definition: MathParseDefinition): definition is MathParseDefinition & { bindingPower: [number, null] } {
  return definition.bindingPower[0] != null && definition.bindingPower[1] == null;
}

export type MathParseDefinition =
  | {
      /**
       * Atom
       */
      bindingPower: [null, null];
      tokens: (MathLayoutContainer | MathLayoutSymbol | MathLayoutText)[];
      mathJson: () => MathJson;
    }
  | {
      /**
       * Prefix
       */
      bindingPower: [null, number];
      tokens: (MathLayoutContainer | MathLayoutSymbol | MathLayoutText)[];
      mathJson: (leftSide: MathJson) => MathJson;
    }
  | {
      /**
       * Infix
       */
      bindingPower: [number, number];
      tokens: (MathLayoutContainer | MathLayoutSymbol | MathLayoutText)[];
      mathJson: (leftSide: MathJson, rightSide: MathJson) => MathJson;
    }
  | {
      /**
       * Postfix
       */
      bindingPower: [number, null];
      tokens: (MathLayoutContainer | MathLayoutSymbol | MathLayoutText)[];
      mathJson: (rightSide: MathJson) => MathJson;
    };
// Parsing Stuff
// - Variables (bound ones): empty argumentDomains aka expressions
// - functions are just prefix operators: sin(), floor(), maybe add a "warning: expected brackets"
// - operators: forall d/dx + * -- ! (prefix, binary, suffix)
// - TODO: special brackets: {s,e,t}, [v e c]
// - TODO: integral dx (probably a special bracket, look at how mathcad-chan does this)

// While parsing, we attempt to tokenize the biggest expression. Then we parse that.
// - Multi letter names (lim and sin)
// - Multi letter with subscript names (C_s) (could be an entire sub-expression, woah)
// - TODO: Partial tokenizing (under-over-integral)?
// - TODO: Derivatives are even harder than sums: d/d(anything)
// - TODO: The fallback for multiple letters is to just take all of them and return a "free variable" (a = 3b)

/**
 * Basic tokens, they also map to some basic MathJson
 * For example, a_cat could be a basic token. And we would map it to ["Symbol", ["Subscript", {sym:"a"}, {sym:"cat"}], {dict: {"documentation": "aaa", argumentDomains: ...}} ]
 *
 * And then there are advanced tokens under-over-integral, lim with a subscript
 */

//const myArray = [1,2,3,4,"5",6,7, undefined,9, 0]
//const filteredArray = myArray.flatMap(val => typeof val === "number" ? val : [])

/**
 * This trie takes you to an approximate position, however there might be multiple definitions with overlapping token-hashes
 * So once we've found something, we need to check all MathDefinition.tokens again, to make sure they're exact matches
 */
class MathParseTrie {
  /**
   * Values at this level in the trie
   */
  values: MathParseDefinition[] = [];

  /**
   * Just has a token-hash instead of a proper MathLayoutContainer | MathLayoutSymbol | MathLayoutText
   */
  children: Map<string, MathParseTrie> = new Map();
  constructor(definitions: MathParseDefinition[]) {
    definitions.forEach((v) => this.#insert(v));
  }

  nextToken<T>(
    tokens: TokenStream<MathLayoutContainer | MathLayoutSymbol | MathLayoutText>,
    sourceMap: Map<MathLayout, MathJson>,
    callback: {
      atom?: (definition: MathParseDefinition & { bindingPower: [null, null] }, consume: () => MathJson) => T;
      prefix?: (definition: MathParseDefinition & { bindingPower: [null, number] }, consume: () => MathJson) => T;
      infix?: (definition: MathParseDefinition & { bindingPower: [number, number] }, consume: () => MathJson) => T;
      postfix?: (definition: MathParseDefinition & { bindingPower: [number, null] }, consume: () => MathJson) => T;
    }
  ): T | null {
    const bindingPowerToCallback = (bp: [number | null, number | null]) => {
      const hasBp = bp.map((v) => v != null);
      if (!hasBp[0] && !hasBp[1]) return "atom";
      else if (!hasBp[0] && hasBp[1]) return "prefix";
      else if (hasBp[0] && hasBp[1]) return "infix";
      else return "postfix";
    };

    const peekedToken = this.peekNextToken(tokens, (definition) => {
      if (callback[bindingPowerToCallback(definition.bindingPower)]) {
        return true;
      } else {
        return false;
      }
    });

    if (peekedToken) {
      // Not super type safe
      const cb = callback[bindingPowerToCallback(peekedToken.definition.bindingPower)];
      assert(cb !== undefined);
      return cb(peekedToken.definition as any, () => peekedToken.consume(sourceMap));
    } else {
      return null;
    }
  }

  /**
   * Parses the next proper token
   * @param tokens the stream of tokens to consume
   * @param expectedBindingPowers is a symbol/prefix/infix/suffix token expected here
   * @returns the parse definition and a consuming function to get the MathJson
   */
  peekNextToken(
    tokens: TokenStream<MathLayoutContainer | MathLayoutSymbol | MathLayoutText>,
    filter: (definition: MathParseDefinition) => boolean
  ): { definition: MathParseDefinition; consume: (sourceMap: Map<MathLayout, MathJson>) => MathJson } | null {
    const matchingDefinitions = MathParseTrie.#peekNextTokenRecursive(tokens, filter, 0, this);
    return matchingDefinitions.length > 0 ? matchingDefinitions[0] : null;
  }

  static #getTokenHash(token: MathLayoutContainer | MathLayoutSymbol | MathLayoutText): string {
    if (token.type == "table") {
      return `${token.type}-`;
    } else if (token.type == "symbol" || token.type == "bracket" || token.type == "text" || token.type == "error") {
      return `${token.type}-${token.value}`;
    } else {
      return `${token.type}-`;
    }
  }

  #insert(definition: MathParseDefinition) {
    // TODO: Warn when definitions conflict
    // TODO: Warn when a type: "bracket" is included in a definition
    let currentTrie: MathParseTrie = this;

    for (let i = 0; i < definition.tokens.length; i++) {
      const tokenHash = MathParseTrie.#getTokenHash(definition.tokens[i]);
      let childTrie = currentTrie.children.get(tokenHash);
      if (!childTrie) {
        childTrie = new MathParseTrie([]);
        currentTrie.children.set(tokenHash, childTrie);
      }

      currentTrie = childTrie;
    }

    currentTrie.values.push(definition);
  }

  static #peekNextTokenRecursive(
    tokens: TokenStream<MathLayoutContainer | MathLayoutSymbol | MathLayoutText>,
    filter: (definition: MathParseDefinition) => boolean,
    plusOffset: number,
    trie: MathParseTrie
  ): { definition: MathParseDefinition; consume: (sourceMap: Map<MathLayout, MathJson>) => MathJson }[] {
    const nextToken = tokens.peek(plusOffset);
    if (nextToken && trie.children.size >= 0) {
      // Go deeper down the tree
      const childTrie = trie.children.get(MathParseTrie.#getTokenHash(nextToken));
      if (childTrie) {
        const matchingDefinition = MathParseTrie.#peekNextTokenRecursive(tokens, filter, plusOffset + 1, childTrie);
        if (matchingDefinition.length > 0) return matchingDefinition;
      }
    }

    // Default case, check if there is a matching definition
    const matchingDefinitions = trie.values
      .filter((definition) =>
        definition.tokens.every((definitionToken, i) => {
          const token = tokens.peek(i);
          return token && isSameMathLayout(definitionToken, token);
        })
      )
      .filter((v) => filter(v));

    const offset = tokens.offset;

    return matchingDefinitions.map((definition) => {
      return {
        definition: definition,
        consume: (sourceMap) => {
          assert(tokens.offset == offset);
          const mathJson = definition.mathJson();
          for (let i = 0; i < definition.tokens.length; i++) {
            const t = tokens.peek(i);
            if (t) {
              sourceMap.set(t, mathJson);
            }
          }
          tokens.offset += definition.tokens.length;
          return mathJson;
        },
      };
    });
  }
}

// TODO:
// Introduce two custom functions
// ["Symbol", mathjson, definition]: Acts like "Hold", but with different semantics
// ["InvisibleOperator", ...mathjson[]]: Multiplication, AB being vectors, ab being string concatenation, ...

// Pattern matching
// under _ > lim
// under _ > sum
// sub _ > variable
// under _ > over _ > sum
// frac > d dt
// bracket table bracket
// bracket value .. value bracket
// { value | value } (maybe the { bracket defines a |  )

// There are two/three ways to approach this
// - parsing state: { above, below } and then when the lower part finds a lim, it takes the n->inf from the parsing state
// - parse the lower part and then, if it returns a lim with a "missing", we insert the bounds
// - parse it as ["under", ["lim"], "n->inf"] and then apply a replacement rule

// f' is still a function, despite it being ["Prime", "f"]
// meanwhile a' is an alternate form of a, ["Prime", "a"]
// So, for any given MathJson, I always need to know its *domain* (but what different domains are there?).
// Otherwise, I can't parse stuff after it (function application or just multiplication)

// I need to know how to "group" stuff
// As in, fac' could be a single function name

// TODO: Mathematics language server
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

// - Inferring types
// => Function argument and return types

// - Showing errors and warnings
// => Illegal operators, invalid syntax, missing stuff, etc.

// - Language server features https://code.visualstudio.com/api/language-extensions/language-server-extension-guide#additional-language-server-features

export function toMathJson(
  mathLayout: MathLayoutRow,
  mathDefinitions: MathParseDefinition[]
): { mathJson: MathJson; sourceMap: Map<MathLayout, MathJson> } {
  // Mixture of a recursive descent parser and a pratt parser
  // https://norasandler.com/2017/11/29/Write-a-Compiler.html
  // https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html
  const tokens = new TokenStream(mathLayout.values, 0);
  const sourceMap = new Map<MathLayout, MathJson>();
  const mathJson = parseRow(tokens, new MathParseTrie(mathDefinitions), sourceMap, 0);

  return {
    mathJson,
    sourceMap,
  };
}

// Grammar stuff
// - Lookahead as much as possible
//   0x should be 0*x
//   0x3f should be the hexadecimal 0x3F
// - When we find a token and know what it means, we do recursion
// - Operator precedence (left and right precedence)
// - Lenient parser, should accept malformed syntax (parsing while entering an equation)

const isDigit = /^[0-9]+$/g;

function parseRow(
  tokens: TokenStream<MathLayoutContainer | MathLayoutSymbol | MathLayoutText>,
  definitions: MathParseTrie,
  sourceMap: Map<MathLayout, MathJson>,
  minBindingPower: number
): MathJson {
  // TODO: debugger;
  /** Expression to the left, has already been parsed */
  let leftPart: MathJson | null = null;

  {
    // Parse a prefix token or an atom

    // nextToken needs
    // - tokens
    // - sourceMap?
    // - a filter (atom/prefix/infix/suffix)

    // alternative: Have different dictionaries for atom/prefix/infix/suffix

    // we get
    // - a token definition, with a specified type ^
    // - a "consume" function

    // the consume function needs
    // - sourceMap
    // - leftSide/rightSide
    // it advances the tokens, sets the sourceMap and returns MathJson

    leftPart = definitions.nextToken(tokens, sourceMap, {
      atom: (_, consume) => consume(),
      prefix: (definition, consume) => [consume(), parseRow(tokens, definitions, sourceMap, definition.bindingPower[1])],
    });
  }
  // TODO: Brackets

  while (true) {
    if (tokens.eof()) break;

    let nextToken;

    if (
      (nextToken = definitions.nextToken(tokens, sourceMap, {
        postfix: (definition, consume) => {
          return { definition, consume };
        },
      }))
    ) {
      if (nextToken.definition.bindingPower[0] < minBindingPower) break;
      leftPart = [nextToken.consume(), leftPart ?? ["Missing"]];
    } else if (
      (nextToken = definitions.nextToken(tokens, sourceMap, {
        infix: (definition, consume) => {
          return { definition, consume };
        },
      }))
    ) {
      if (nextToken.definition.bindingPower[0] < minBindingPower) break;
      leftPart = [
        nextToken.consume(),
        leftPart ?? ["Missing"],
        parseRow(tokens, definitions, sourceMap, nextToken.definition.bindingPower[1]),
      ];
    } else if (
      (nextToken = definitions.nextToken(tokens, sourceMap, {
        atom: (definition, consume) => {
          return { definition, consume };
        },
      }))
    ) {
      assert(leftPart != null);
      leftPart = ["InvisibleOperator", leftPart, nextToken.consume()];
    } else {
      // Prefix tokens shouldn't happen here
      // Default case
      const peekedToken = tokens.peek();
      if (!peekedToken) break;

      if (peekedToken.type == "symbol") {
      } else {
      }

      throw new Error("We should never get here, TODO:Write some default case coode");
    }
  }

  return leftPart ?? ["Missing"];
}

function parseNumber(
  tokens: TokenStream<MathLayoutContainer | MathLayoutSymbol | MathLayoutText>,
  definitions: MathParseTrie,
  sourceMap: Map<MathLayout, MathJson>
): MathParseDefinition {
  const mathLayout = tokens.next();
  assert(mathLayout?.type == "symbol");

  const mathJson: MathJsonNumber = {
    num: mathLayout.value,
  };
  sourceMap.set(mathLayout, mathJson);

  let hasDot = false;

  while (true) {
    const mathLayout = tokens.peek();
    if (!mathLayout) break;

    if (mathLayout.type == "symbol") {
      if (isDigit.test(mathLayout.value)) {
        mathJson.num += mathLayout.value;
        sourceMap.set(mathLayout, mathJson);
        tokens.next();
      } else if (mathLayout.value == "." && !hasDot) {
        mathJson.num += mathLayout.value;
        sourceMap.set(mathLayout, mathJson);
        hasDot = true;
        tokens.next();
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return {
    bindingPower: [null, null],
    tokens: [],
    mathJson: () => mathJson,
  };
}

export function fromMathJson(mathJson: MathJson): MathLayout {
  throw new Error("Not implemented");
}
