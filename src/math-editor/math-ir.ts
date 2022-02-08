import { assert } from "src/assert";
import { MathLayout, MathLayoutContainer, MathLayoutRow, MathLayoutSymbol, MathLayoutText } from "./math-layout";
import { TokenStream } from "./token-stream";
import { isSame as isSameMathLayout } from "./math-layout-utils";

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
  def: MathDefinition;
};
export type MathJson =
  // Arbitrary numbers with a decimal point
  | MathJsonNumber
  // Text
  | MathJsonString
  // Dictionaries
  | MathJsonDictionary
  // Apply a function (head) to some arguments (tail)
  | MathJson[]
  | [string, ...MathJson[]];

export type MathDefinition = {
  // TODO: Put interesting info about the symbol here
  documentation: string;
  // Constants are functions with zero arguments
  // Domains: https://cortexjs.io/compute-engine/reference/domains/
  argumentDomains: MathJson[];
  returnDomain: MathJson;

  // More stuff:
  // - Symbol (for operators)
  // - Relations are just functions with multiple arguments and a boolean return value

  // While parsing, we attempt to tokenize the biggest expression. Then we parse that.
  // - Multi letter names (lim and sin)
  // - Multi letter with subscript names (C_s) (could be an entire sub-expression, woah)
  // - The fallback for multiple letters is to just take all of them and return a "free variable" (a = 3b)
  tokens: (MathLayoutContainer | MathLayoutSymbol | MathLayoutText)[];
};

// We might need something like this. At least every expression needs to keep track of which definitions it references.
export interface MathDefinitions {
  getDefinition(name: string): MathDefinition | null;
}

/**
 * This trie takes you to an approximate position, however there might be multiple definitions with overlapping token-hashes
 * So once we've found something, we need to check all MathDefinition.tokens again, to make sure they're exact matches
 */
class MathDefinitionTrie {
  /**
   * Values at this level in the trie
   */
  values: MathDefinition[] = [];

  /**
   * Just has a token-hash instead of a proper MathLayoutContainer | MathLayoutSymbol | MathLayoutText
   */
  children: Map<string, MathDefinitionTrie> = new Map();
  constructor(definitions: MathDefinition[]) {
    definitions.forEach((v) => this.#insert(v));
  }

  /**
   * Like TokenStream.next, except that it parses a full MathDefinition
   */
  nextToken(tokens: TokenStream<MathLayoutContainer | MathLayoutSymbol | MathLayoutText>): MathDefinition | null {
    return MathDefinitionTrie.#nextTokenRecursive(tokens, 0, this);
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

  #insert(definition: MathDefinition) {
    // TODO: Warn when definitions conflict
    // TODO: Warn when a type: "bracket" is included in a definition
    let currentTrie: MathDefinitionTrie = this;

    for (let i = 0; i < definition.tokens.length; i++) {
      const tokenHash = MathDefinitionTrie.#getTokenHash(definition.tokens[i]);
      let childTrie = currentTrie.children.get(tokenHash);
      if (!childTrie) {
        childTrie = new MathDefinitionTrie([]);
        currentTrie.children.set(tokenHash, childTrie);
      }

      currentTrie = childTrie;
    }

    currentTrie.values.push(definition);
  }

  static #nextTokenRecursive(
    tokens: TokenStream<MathLayoutContainer | MathLayoutSymbol | MathLayoutText>,
    plusOffset: number,
    trie: MathDefinitionTrie
  ): MathDefinition | null {
    const nextToken = tokens.peek(plusOffset);
    if (nextToken && trie.children.size >= 0) {
      // Go deeper down the tree
      const childTrie = trie.children.get(MathDefinitionTrie.#getTokenHash(nextToken));
      if (childTrie) {
        const matchingDefinition = MathDefinitionTrie.#nextTokenRecursive(tokens, plusOffset + 1, childTrie);
        if (matchingDefinition) return matchingDefinition;
      }
    }

    // Default case, check if there is a matching definition
    const matchingDefinition = trie.values.find((definition) =>
      definition.tokens.every((definitionToken, i) => {
        const token = tokens.peek(i);
        return token && isSameMathLayout(definitionToken, token);
      })
    );

    if (matchingDefinition) {
      tokens.offset += matchingDefinition.tokens.length;
    }

    return matchingDefinition ?? null;
  }
}

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

export function toMathJson(
  mathLayout: MathLayoutRow,
  mathDefinitions: MathDefinition[]
): { mathJson: MathJson; sourceMap: Map<MathLayout, MathJson> } {
  // Mixture of a recursive descent parser and a pratt parser
  // https://norasandler.com/2017/11/29/Write-a-Compiler.html
  // https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html
  const tokens = new TokenStream(mathLayout.values, 0);
  const sourceMap = new Map<MathLayout, MathJson>();
  const mathJson = parseRow(tokens, new MathDefinitionTrie(mathDefinitions), sourceMap);

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
  definitions: MathDefinitionTrie,
  sourceMap: Map<MathLayout, MathJson>
): MathJson {
  while (true) {
    // First step: Figure out which parser is the correct one
    // After that: Parse it
    const mathLayout = tokens.peek();
    if (!mathLayout) break;

    if (mathLayout.type == "symbol") {
      if (isDigit.test(mathLayout.value)) {
        const parsedNumber = parseNumber(tokens, definitions, sourceMap);
      } else {
        const parsedDefinition = definitions.nextToken(tokens);
        // TODO: Set the source map correctly
      }
    } else if (mathLayout.type == "frac") {
      const parsedFraction: MathJson = [
        "Divide",
        parseRow(new TokenStream(mathLayout.values[0].values, 0), definitions, sourceMap),
        parseRow(new TokenStream(mathLayout.values[1].values, 0), definitions, sourceMap),
      ];
      sourceMap.set(mathLayout, parsedFraction);
    } else {
      // Actually there are more cases where the MathDefinitionTrie is relevant. Like "under - lim"
    }
  }

  return null as any;
}

function parseNumber(
  tokens: TokenStream<MathLayoutContainer | MathLayoutSymbol | MathLayoutText>,
  definitions: MathDefinitionTrie,
  sourceMap: Map<MathLayout, MathJson>
): MathJsonNumber {
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

  return mathJson;
}

export function fromMathJson(mathJson: MathJson): MathLayout {
  throw new Error("Not implemented");
}
