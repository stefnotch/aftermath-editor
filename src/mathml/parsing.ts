import { assert } from "../utils/assert";
import { MathLayoutElement, MathLayoutRow, MathLayoutSymbol } from "../math-layout/math-layout";
import { mathLayoutWithWidth, wrapInRow } from "../math-layout/math-layout-utils";
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
    return mathLayoutWithWidth({
      type: "text",
      values: [
        mathLayoutWithWidth({
          type: "row",
          values: unicodeSplit(getText(element)).map((v) =>
            mathLayoutWithWidth({
              type: "symbol",
              value: v,
              width: 0,
            })
          ),
          width: 0,
        }),
      ],
      width: 0,
    });
  } else if (tagIs(element, "mi", "mn")) {
    return unicodeSplit(getText(element)).map((v) =>
      mathLayoutWithWidth({
        type: "symbol",
        value: v,
        width: 0,
      })
    );
  } else if (tagIs(element, "mo")) {
    return unicodeSplit(getText(element)).map((v) => {
      if (element.getAttribute("stretchy") != "false" && allBrackets.has(v)) {
        return mathLayoutWithWidth({
          type: "bracket",
          value: v,
          width: 0,
        });
      } else {
        return mathLayoutWithWidth({
          type: "symbol",
          value: v,
          width: 0,
        });
      }
    });
  } else if (tagIs(element, "mfrac")) {
    return (
      expectNChildren(element, 2) ??
      mathLayoutWithWidth({
        type: "fraction",
        values: children.map((c) => wrapInRow(toMathLayout(c))) as [MathLayoutRow, MathLayoutRow],
        width: 0,
      })
    );
  } else if (tagIs(element, "msqrt")) {
    return mathLayoutWithWidth({
      type: "root",
      values: [
        wrapInRow(
          mathLayoutWithWidth({
            type: "symbol",
            value: "2",
            width: 0,
          })
        ),
        wrapInRow(children.flatMap((c) => toMathLayout(c))),
      ],
      width: 0,
    });
  } else if (tagIs(element, "mroot")) {
    return (
      expectNChildren(element, 2) ??
      mathLayoutWithWidth({
        type: "root",
        values: [wrapInRow(toMathLayout(children[1])), wrapInRow(toMathLayout(children[0]))],
        width: 0,
      })
    );
  } else if (tagIs(element, "msub")) {
    let base = toMathLayout(children[0]);
    if (!Array.isArray(base)) {
      base = [base];
    }
    return (
      expectNChildren(element, 2) ?? [
        ...base,
        mathLayoutWithWidth({
          type: "sub",
          values: [wrapInRow(toMathLayout(children[1]))],
          width: 0,
        }),
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
        mathLayoutWithWidth({
          type: "sup",
          values: [wrapInRow(toMathLayout(children[1]))],
          width: 0,
        }),
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
        mathLayoutWithWidth({
          type: "sub",
          values: [wrapInRow(toMathLayout(children[1]))],
          width: 0,
        }),
        mathLayoutWithWidth({
          type: "sup",
          values: [wrapInRow(toMathLayout(children[2]))],
          width: 0,
        }),
      ]
    );
  } else if (tagIs(element, "munder")) {
    return (
      expectNChildren(element, 2) ??
      mathLayoutWithWidth({
        type: "under",
        values: [wrapInRow(toMathLayout(children[0])), wrapInRow(toMathLayout(children[1]))],
        width: 0,
      })
    );
  } else if (tagIs(element, "mover")) {
    return (
      expectNChildren(element, 2) ??
      mathLayoutWithWidth({
        type: "over",
        values: [wrapInRow(toMathLayout(children[0])), wrapInRow(toMathLayout(children[1]))],
        width: 0,
      })
    );
  } else if (tagIs(element, "munderover")) {
    return (
      expectNChildren(element, 3) ??
      mathLayoutWithWidth({
        type: "over",
        values: [
          wrapInRow(
            mathLayoutWithWidth({
              type: "under",
              values: [wrapInRow(toMathLayout(children[0])), wrapInRow(toMathLayout(children[1]))],
              width: 0,
            })
          ),
          wrapInRow(toMathLayout(children[2])),
        ],
        width: 0,
      })
    );
  } else if (tagIs(element, "mtable")) {
    if (!children.every((c) => tagIs(c, "mtr") && [...c.children].every((cc) => tagIs(cc, "mtd")))) {
      return mathLayoutWithWidth({
        type: "error",
        value: "Unexpected children " + element,
        width: 0,
      });
    }

    const tableWidth = children.map((c) => c.children.length).reduce((a, b) => Math.max(a, b), 0);

    const tableCells = children.flatMap((c) =>
      Array.from({ length: tableWidth }, (_, i) =>
        i < c.children.length
          ? wrapInRow(toMathLayout(c.children[i]))
          : mathLayoutWithWidth({ type: "row", values: [], width: 0 })
      )
    );

    return mathLayoutWithWidth({
      type: "table",
      rowWidth: tableWidth,
      values: tableCells,
      width: 0,
    });
  } else {
    return mathLayoutWithWidth({
      type: "error",
      value: "Unknown element " + element,
      width: 0,
    });
  }
}

export function expectNChildren(element: Element, n: number): (MathLayoutSymbol & { type: "error" }) | null {
  if (element.children.length != n) {
    return mathLayoutWithWidth({
      type: "error",
      value: `Expected ${n} children in ${element.tagName.toLowerCase()}`,
      width: 0,
    });
  }
  return null;
}

function getText(element: Element) {
  // Good enough for now
  return (element.textContent + "").trim();
}

function unicodeSplit(text: string) {
  // TODO: For text use https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter
  // TODO: https://stackoverflow.com/a/73802453/3492994
  return [...text];
}
