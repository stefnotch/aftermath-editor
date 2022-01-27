import { assert } from "../assert";
import { MathIR, MathIRRow } from "./math-ir";
import { endingBrackets, startingBrackets } from "./mathml-spec";

/**
 * Guarantees that something is wrapped in a row
 */
export function wrapInRow(mathIR: MathIR | MathIR[] | null): MathIRRow {
  if (mathIR == null) {
    return { type: "row", values: [] };
  }

  if (!Array.isArray(mathIR)) {
    if (mathIR.type == "row") {
      return mathIR;
    }
    mathIR = [mathIR];
  }

  return {
    type: "row",
    values: mathIR.flatMap((v) => {
      if (v.type == "row") {
        return v.values;
      } else {
        return v;
      }
    }),
  };
}

/**
 * Finds the starting/ending bracket for a given ending/starting bracket
 * @param direction the search direction, use "right" to find an ending bracket
 */
export function findOtherBracket(mathIR: MathIR[], bracketIndex: number, direction: "left" | "right"): number | null {
  const isLeft = direction == "left";
  const bracket = mathIR[bracketIndex];
  assert(bracket.type == "bracket");

  let bracketCounter = 0;
  let i = bracketIndex + (isLeft ? -1 : +1);

  const sameBracketType = isLeft ? endingBrackets : startingBrackets;
  const otherBracketType = isLeft ? startingBrackets : endingBrackets;

  while (i >= 0 && i < mathIR.length) {
    const element = mathIR[i];
    if (element.type != "bracket") continue;

    if (sameBracketType.has(element.value)) {
      bracketCounter += 1;
    } else if (otherBracketType.has(element.value)) {
      if (bracketCounter <= 0) {
        // Doesn't bother finding the absolutely correct bracket type
        return i;
      } else {
        bracketCounter -= 1;
      }
    }

    i += isLeft ? -1 : +1;
  }

  return null;
}

/**
 * Finds the next best bracket that is the same
 */
export function findEitherEndingBracket(mathIR: MathIR[], startingBracketIndex: number): number | null {
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
