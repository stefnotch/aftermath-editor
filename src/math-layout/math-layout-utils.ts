import { assert } from "../utils/assert";
import { MathLayoutElement, MathLayoutRow, MathLayoutTable } from "./math-layout";
import { endingBrackets, startingBrackets } from "../mathml/mathml-spec";

/**
 * Guarantees that something is wrapped in a row. Also flattens nested rows.
 */
export function wrapInRow(
  mathLayout: (MathLayoutRow | MathLayoutElement) | (MathLayoutRow | MathLayoutElement)[] | null
): MathLayoutRow {
  if (mathLayout == null) {
    return { type: "row", values: [] };
  }

  if (!Array.isArray(mathLayout)) {
    if (mathLayout.type == "row") {
      return mathLayout;
    }
    mathLayout = [mathLayout];
  }

  return {
    type: "row",
    values: mathLayout.flatMap((v) => {
      if (v.type == "row") {
        return v.values;
      } else {
        return v;
      }
    }),
  };
}

export function tableIndexToPosition(table: MathLayoutTable, index: number): [number, number] {
  return [index % table.width, Math.floor(index / table.width)];
}

export function tablePositionToIndex(table: MathLayoutTable, position: [number, number]): number {
  return position[1] * table.width + position[0];
}

/**
 * TODO: Change the mathLayout to be `row: MathLayoutRow`
 * Finds the starting/ending bracket for a given ending/starting bracket
 * @param direction the search direction, use "right" to find an ending bracket
 */
export function findOtherBracket(
  mathLayout: readonly (MathLayoutRow | MathLayoutElement)[],
  bracketIndex: number,
  direction: "left" | "right"
): number | null {
  const isLeft = direction == "left";
  const bracket = mathLayout[bracketIndex];
  assert(bracket.type == "bracket");

  let bracketCounter = 0;

  const sameBracketType = isLeft ? endingBrackets : startingBrackets;
  const otherBracketType = isLeft ? startingBrackets : endingBrackets;

  const iIncrement = isLeft ? -1 : 1;
  for (let i = bracketIndex + iIncrement; 0 <= i && i < mathLayout.length; i += iIncrement) {
    const element = mathLayout[i];
    if (element.type === "bracket") {
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
    }
  }

  return null;
}

/**
 * Finds the next best bracket that is the same
 */
export function findEitherEndingBracket(
  mathLayout: readonly (MathLayoutRow | MathLayoutElement)[],
  startingBracketIndex: number
): number | null {
  const startingBracket = mathLayout[startingBracketIndex];
  assert(startingBracket.type == "bracket");

  let bracketCounter = 0;
  for (let i = startingBracketIndex + 1; i < mathLayout.length; i++) {
    const element = mathLayout[i];
    if (element.type !== "bracket") continue;

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

export function isSame(a: MathLayoutRow | MathLayoutElement, b: MathLayoutRow | MathLayoutElement): boolean {
  if (a.type !== b.type) return false;

  if (a.type === "row") {
    assert(b.type === a.type);
    return a.values.every((v, i) => isSame(v, b.values[i]));
  } else if (a.type === "symbol" || a.type === "bracket" || a.type === "text" || a.type === "error") {
    assert(b.type === a.type);
    return a.values === b.values;
  } else if (a.type === "table") {
    assert(b.type === a.type);
    return a.width === b.width && a.values.length === b.values.length && a.values.every((v, i) => isSame(v, b.values[i]));
  } else {
    assert(b.type === a.type);
    return a.values.every((v, i) => isSame(v, b.values[i]));
  }
}
