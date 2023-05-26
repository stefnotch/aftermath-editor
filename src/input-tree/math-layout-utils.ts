import { assert } from "../utils/assert";
import { isMathLayoutRow, isMathLayoutSymbol, MathLayoutElement, MathLayoutRow, MathLayoutTable } from "./math-layout";

/**
 * Guarantees that something is wrapped in a row. Also flattens nested rows.
 */
export function wrapInRow(
  mathLayout: (MathLayoutRow | MathLayoutElement) | (MathLayoutRow | MathLayoutElement)[] | null
): MathLayoutRow {
  if (mathLayout == null) {
    return mathLayoutWithWidth({ type: "row", values: [], offsetCount: 0 });
  }

  if (!Array.isArray(mathLayout)) {
    if (mathLayout.type == "row") {
      return mathLayout;
    }
    mathLayout = [mathLayout];
  }

  return mathLayoutWithWidth({
    type: "row",
    values: mathLayout.flatMap((v) => {
      if (v.type == "row") {
        return v.values;
      } else {
        return v;
      }
    }),
    offsetCount: 0,
  });
}

export function tableIndexToPosition(table: MathLayoutTable, index: number): [number, number] {
  return [index % table.rowWidth, Math.floor(index / table.rowWidth)];
}

export function tablePositionToIndex(table: MathLayoutTable, position: [number, number]): number {
  return position[1] * table.rowWidth + position[0];
}

function calculateMathLayoutWidth(values: readonly MathLayoutRow[] | readonly MathLayoutElement[]): number {
  return values.map((v) => v.offsetCount).reduce((a, b) => a + b, 0);
}
export function mathLayoutWithWidth<T extends MathLayoutRow | MathLayoutElement>(value: T): T {
  if (isMathLayoutSymbol(value)) {
    return { ...value, offsetCount: 0 };
  } else if (isMathLayoutRow(value)) {
    const numberOfOffsets = value.values.length + 1;
    return { ...value, offsetCount: numberOfOffsets + calculateMathLayoutWidth(value.values) };
  } else {
    return { ...value, offsetCount: calculateMathLayoutWidth(value.values) };
  }
}

export function isSame(a: MathLayoutRow | MathLayoutElement, b: MathLayoutRow | MathLayoutElement): boolean {
  if (a.type !== b.type) return false;
  if (a.offsetCount !== b.offsetCount) return false;

  if (a.type === "row") {
    assert(b.type === a.type);
    return a.values.every((v, i) => isSame(v, b.values[i]));
  } else if (a.type === "symbol" || a.type === "error") {
    assert(b.type === a.type);
    return a.value === b.value;
  } else if (a.type === "table") {
    assert(b.type === a.type);
    return a.rowWidth === b.rowWidth && a.values.length === b.values.length && a.values.every((v, i) => isSame(v, b.values[i]));
  } else {
    assert(b.type === a.type);
    return a.values.every((v, i) => isSame(v, b.values[i]));
  }
}
