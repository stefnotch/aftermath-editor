import { InputNode } from "./input-node";
import { InputRow } from "./row";
/**
 * Guarantees that something is wrapped in a row. Also flattens nested rows.
 */
export function wrapInRow(mathLayout: (InputRow | InputNode) | (InputRow | InputNode)[] | null): InputRow {
  if (mathLayout == null) {
    return new InputRow([]);
  }

  if (!Array.isArray(mathLayout)) {
    if (mathLayout instanceof InputRow) {
      return mathLayout;
    }
    mathLayout = [mathLayout];
  }
  return new InputRow(
    mathLayout.flatMap((v) => {
      if (v instanceof InputRow) {
        return v.values;
      } else {
        return v;
      }
    })
  );
}
