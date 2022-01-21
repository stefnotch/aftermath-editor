import { assert } from "../assert";
import { MathIR, MathIRContainer, MathIRRow } from "./math-ir";
import { endingBrackets, startingBrackets } from "./mathml-spec";

/**
 * Guarantees that something is wrapped in a row
 */
export function wrapInRow(mathIR: MathIR | MathIR[]): MathIRRow {
  if (!Array.isArray(mathIR)) {
    if (mathIR.type == "row") {
      return mathIR;
    }
    mathIR = [mathIR];
  }

  return {
    type: "row",
    values: mathIR.map((v) => {
      // Maybe we should actually try to handle this
      assert(v.type != "row");
      return v;
    }),
  };
}

/**
 * Finds the ending bracket for a given starting bracket
 */
export function findEndingBracket(
  mathIR: MathIR[],
  startingBracketIndex: number
): number | null {
  const startingBracket = mathIR[startingBracketIndex];
  assert(startingBracket.type == "bracket");

  let bracketCounter = 0;
  for (let i = startingBracketIndex + 1; i < mathIR.length; i++) {
    const element = mathIR[i];
    if (element.type != "bracket") continue;

    if (startingBrackets.has(element.value)) {
      bracketCounter += 1;
    } else if (endingBrackets.has(element.value)) {
      if (bracketCounter > 0) {
        bracketCounter -= 1;
      } else {
        // Doesn't bother finding the correct bracket type
        return i;
      }
    }
  }

  return null;
}

/**
 * Finds the next best bracket that is the same
 */
export function findEitherEndingBracket(
  mathIR: MathIR[],
  startingBracketIndex: number
): number | null {
  const startingBracket = mathIR[startingBracketIndex];
  assert(startingBracket.type == "bracket");

  let bracketCounter = 0;
  for (let i = startingBracketIndex + 1; i < mathIR.length; i++) {
    const element = mathIR[i];
    if (element.type != "bracket") continue;

    if (bracketCounter <= 0 && element.value == startingBracket.value) {
      return i;
    }

    if (startingBrackets.has(element.value)) {
      bracketCounter += 1;
    } else if (endingBrackets.has(element.value)) {
      if (bracketCounter > 0) {
        bracketCounter -= 1;
      }
      // Becoming smaller than 0 is technically a parsing error
    }
  }

  return null;
}

export function expectNChildren(element: Element, n: number): MathIR | null {
  if (element.children.length != n) {
    return {
      type: "error",
      value: `Expected ${n} children in ${element.tagName.toLowerCase()}`,
    };
  }
  return null;
}

export function isMathIRContainer(mathIR: MathIR): mathIR is MathIRContainer {
  return (
    mathIR.type == "frac" ||
    mathIR.type == "root" ||
    mathIR.type == "under" ||
    mathIR.type == "over" ||
    mathIR.type == "sup" ||
    mathIR.type == "sub" ||
    mathIR.type == "table"
  );
}
