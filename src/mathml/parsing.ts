import { assert } from "../utils/assert";
import { MathLayoutElement, MathLayoutRow, MathLayoutText } from "../math-layout/math-layout";
import { wrapInRow } from "../math-layout/math-layout-utils";
import { allBrackets } from "./mathml-spec";
import { tagIs } from "../utils/dom-utils";

/**
 * Takes a MathML DOM tree and returns a MathLayout
 */
export function fromElement(element: HTMLElement | MathMLElement): MathLayoutRow {
  assert(tagIs(element, "math"));
  const mathLayout = toMathLayout(element);
  assert(!Array.isArray(mathLayout));
  assert(mathLayout.type == "row");

  return mathLayout;
}

// Time to iterate over the MathML and create a cute little tree
// Doesn't deal with horrible MathML yet (so stuff like unnecessary nested mrows is bad, maybe that should be a post-processing step?)
function toMathLayout(element: Element): (MathLayoutRow | MathLayoutElement) | (MathLayoutRow | MathLayoutElement)[] {
  let children = [...element.children];

  if (tagIs(element, "math", "mrow", "mtd")) {
    // Uses flatMap so that msub can return two elements...
    return wrapInRow(children.flatMap((c) => toMathLayout(c)));
  } else if (tagIs(element, "semantics") && children.length > 0) {
    return toMathLayout(children[0]);
  } else if (tagIs(element, "mtext", "ms")) {
    return {
      type: "text",
      values: getText(element),
    };
  } else if (tagIs(element, "mi", "mn")) {
    return getText(element)
      .split("")
      .map((v) => {
        return {
          type: "symbol",
          value: v,
        };
      });
  } else if (tagIs(element, "mo")) {
    return getText(element)
      .split("")
      .map((v) => {
        if (element.getAttribute("stretchy") != "false" && allBrackets.has(v)) {
          return {
            type: "bracket",
            value: v,
          };
        } else {
          return {
            type: "symbol",
            value: v,
          };
        }
      });
  } else if (tagIs(element, "mfrac")) {
    return (
      expectNChildren(element, 2) ?? {
        type: "fraction",
        values: children.map((c) => wrapInRow(toMathLayout(c))) as [MathLayoutRow, MathLayoutRow],
      }
    );
  } else if (tagIs(element, "msqrt")) {
    return {
      type: "root",
      values: [
        wrapInRow({
          type: "symbol",
          value: "2",
        }),
        wrapInRow(children.flatMap((c) => toMathLayout(c))),
      ],
    };
  } else if (tagIs(element, "mroot")) {
    return (
      expectNChildren(element, 2) ?? {
        type: "root",
        values: [wrapInRow(toMathLayout(children[1])), wrapInRow(toMathLayout(children[0]))],
      }
    );
  } else if (tagIs(element, "msub")) {
    let base = toMathLayout(children[0]);
    if (!Array.isArray(base)) {
      base = [base];
    }
    return (
      expectNChildren(element, 2) ?? [
        ...base,
        {
          type: "sub",
          values: [wrapInRow(toMathLayout(children[1]))],
        },
      ]
    );
  } else if (tagIs(element, "msup")) {
    let base = toMathLayout(children[0]);
    if (!Array.isArray(base)) {
      base = [base];
    }
    return (
      expectNChildren(element, 2) ?? [
        ...base,
        {
          type: "sup",
          values: [wrapInRow(toMathLayout(children[1]))],
        },
      ]
    );
  } else if (tagIs(element, "msubsup")) {
    let base = toMathLayout(children[0]);
    if (!Array.isArray(base)) {
      base = [base];
    }
    return (
      expectNChildren(element, 3) ?? [
        ...base,
        {
          type: "sub",
          values: [wrapInRow(toMathLayout(children[1]))],
        },
        {
          type: "sup",
          values: [wrapInRow(toMathLayout(children[2]))],
        },
      ]
    );
  } else if (tagIs(element, "munder")) {
    return (
      expectNChildren(element, 2) ?? {
        type: "under",
        values: [wrapInRow(toMathLayout(children[0])), wrapInRow(toMathLayout(children[1]))],
      }
    );
  } else if (tagIs(element, "mover")) {
    return (
      expectNChildren(element, 2) ?? {
        type: "over",
        values: [wrapInRow(toMathLayout(children[0])), wrapInRow(toMathLayout(children[1]))],
      }
    );
  } else if (tagIs(element, "munderover")) {
    return (
      expectNChildren(element, 3) ?? {
        type: "over",
        values: [
          wrapInRow({
            type: "under",
            values: [wrapInRow(toMathLayout(children[0])), wrapInRow(toMathLayout(children[1]))],
          }),
          wrapInRow(toMathLayout(children[2])),
        ],
      }
    );
  } else if (tagIs(element, "mtable")) {
    if (!children.every((c) => tagIs(c, "mtr") && [...c.children].every((cc) => tagIs(cc, "mtd")))) {
      return {
        type: "error",
        values: "Unexpected children " + element,
      };
    }

    const tableWidth = children.map((c) => c.children.length).reduce((a, b) => Math.max(a, b), 0);

    const tableCells = children.flatMap((c) =>
      Array.from({ length: tableWidth }, (_, i) =>
        i < c.children.length ? wrapInRow(toMathLayout(c.children[i])) : ({ type: "row", values: [] } as MathLayoutRow)
      )
    );

    return {
      type: "table",
      width: tableWidth,
      values: tableCells,
    };
  } else {
    return {
      type: "error",
      values: "Unknown element " + element,
    };
  }
}

export function expectNChildren(element: Element, n: number): (MathLayoutText & { type: "error" }) | null {
  if (element.children.length != n) {
    return {
      type: "error",
      values: `Expected ${n} children in ${element.tagName.toLowerCase()}`,
    };
  }
  return null;
}

function getText(element: Element) {
  // Good enough for now
  return (element.textContent + "").trim();
}
