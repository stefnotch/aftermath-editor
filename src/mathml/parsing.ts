import { isInputRow, type InputNode, type InputRow } from "../core";
import { assert } from "../utils/assert";
/**
 * Takes a MathML DOM tree and returns a MathLayout
 * TODO: A parser should specify which syntax it emits. (e.g. Emits quoted strings)
 * TODO: It should always emit valid stuff, and the invariants like "a fraction has two rows" should be encoded in the types.
 */
export function fromElement(element: HTMLElement | MathMLElement): { root: InputRow; errors: Error[] } {
  assert(tagIs(element, "math"));
  const errors: Error[] = [];
  const root = toMathLayout(element, errors);
  assert(isInputRow(root));
  return { root, errors };
}
function symbol(value: string): InputNode {
  return {
    Symbol: value.normalize("NFD"),
  };
}
function fraction(values: [InputRow, InputRow]): InputNode {
  return {
    Container: [
      "Fraction",
      {
        values,
        width: 1,
      },
    ],
  };
}
function root(values: [InputRow, InputRow]): InputNode {
  return {
    Container: [
      "Root",
      {
        values,
        width: 2,
      },
    ],
  };
}
function sup(value: InputRow): InputNode {
  return {
    Container: [
      "Sup",
      {
        values: [value],
        width: 1,
      },
    ],
  };
}
function sub(value: InputRow): InputNode {
  return {
    Container: [
      "Sub",
      {
        values: [value],
        width: 1,
      },
    ],
  };
}
function table(values: InputRow[], width: number): InputNode {
  return {
    Container: [
      "Table",
      {
        values,
        width,
      },
    ],
  };
}

// Time to iterate over the MathML and create a cute little tree
// Probably doesn't deal with bad MathML yet
function toMathLayout(element: Element, errors: Error[]): (InputRow | InputNode) | (InputRow | InputNode)[] {
  let children = [...element.children];

  if (tagIs(element, "math", "mrow", "mtd")) {
    // Uses flatMap so that msub can return two elements...
    return wrapInRow(children.flatMap((c) => toMathLayout(c, errors)));
  } else if (tagIs(element, "semantics") && children.length > 0) {
    return toMathLayout(children[0], errors);
  } else if (tagIs(element, "mtext", "ms")) {
    return [symbol('"'), ...unicodeSplit(getText(element)).map((v) => symbol(v)), symbol('"')];
  } else if (tagIs(element, "mi", "mn")) {
    return unicodeSplit(getText(element)).map((v) => symbol(v));
  } else if (tagIs(element, "mo")) {
    return unicodeSplit(getText(element)).map((v) => symbol(v));
  } else if (tagIs(element, "mfrac")) {
    return (
      expectNChildren(element, 2, errors) ??
      fraction(children.map((c) => wrapInRow(toMathLayout(c, errors))) as [InputRow, InputRow])
    );
  } else if (tagIs(element, "msqrt")) {
    return root([wrapInRow(symbol("2")), wrapInRow(children.flatMap((c) => toMathLayout(c, errors)))]);
  } else if (tagIs(element, "mroot")) {
    return (
      expectNChildren(element, 2, errors) ??
      root([wrapInRow(toMathLayout(children[1], errors)), wrapInRow(toMathLayout(children[0], errors))])
    );
  } else if (tagIs(element, "msub")) {
    let base = toMathLayout(children[0], errors);
    if (!Array.isArray(base)) {
      base = [base];
    }
    return expectNChildren(element, 2, errors) ?? [...base, sub(wrapInRow(toMathLayout(children[1], errors)))];
  } else if (tagIs(element, "msup")) {
    let base = toMathLayout(children[0], errors);
    if (!Array.isArray(base)) {
      base = [base];
    }
    return expectNChildren(element, 2, errors) ?? [...base, sup(wrapInRow(toMathLayout(children[1], errors)))];
  } else if (tagIs(element, "msubsup")) {
    let base = toMathLayout(children[0], errors);
    if (!Array.isArray(base)) {
      base = [base];
    }
    return (
      expectNChildren(element, 3, errors) ?? [
        ...base,
        sub(wrapInRow(toMathLayout(children[1], errors))),
        sup(wrapInRow(toMathLayout(children[2], errors))),
      ]
    );
  } else if (tagIs(element, "munder")) {
    // It's usually a sub/sup
    return (
      expectNChildren(element, 2, errors) ?? [
        ...wrapInRow(toMathLayout(children[0], errors)).values,
        sub(wrapInRow(toMathLayout(children[1], errors))),
      ]
    );
  } else if (tagIs(element, "mover")) {
    return (
      expectNChildren(element, 2, errors) ?? [
        ...wrapInRow(toMathLayout(children[0], errors)).values,
        sup(wrapInRow(toMathLayout(children[1], errors))),
      ]
    );
  } else if (tagIs(element, "munderover")) {
    return (
      expectNChildren(element, 3, errors) ?? [
        ...wrapInRow(toMathLayout(children[0], errors)).values,
        sub(wrapInRow(toMathLayout(children[1], errors))),
        sup(wrapInRow(toMathLayout(children[2], errors))),
      ]
    );
  } else if (tagIs(element, "mtable")) {
    if (!children.every((c) => tagIs(c, "mtr") && [...c.children].every((cc) => tagIs(cc, "mtd")))) {
      errors.push(new Error("Unexpected children " + element));
      return symbol("Error");
    }

    const tableWidth = children.map((c) => c.children.length).reduce((a, b) => Math.max(a, b), 0);

    const tableCells = children.flatMap((c) =>
      Array.from({ length: tableWidth }, (_, i) =>
        i < c.children.length ? wrapInRow(toMathLayout(c.children[i], errors)) : { values: [] }
      )
    );

    return table(tableCells, tableWidth);
  } else if (tagIs(element, "mstyle")) {
    return [];
  } else {
    errors.push(new Error("Unknown element " + element.tagName));
    return symbol("Error");
  }
}

function expectNChildren(element: Element, n: number, errors: Error[]): InputNode | null {
  if (element.children.length != n) {
    errors.push(new Error(`Expected ${n} children in ${element.tagName.toLowerCase()}`));
    return symbol("Error");
  }
  return null;
}

function getText(element: Element) {
  // Good enough for now
  return (element.textContent + "").trim();
}

const intlSegmenter = globalThis?.Intl?.Segmenter ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;

export function unicodeSplit(text: string) {
  if (intlSegmenter) {
    return Array.from(intlSegmenter.segment(text), ({ segment }) => segment);
  } else {
    return [...text];
  }
}

/**
 * Checks if an element has a given tag name
 */
function tagIs(element: Element, ...tagNames: string[]): boolean {
  return tagNames.includes(element.tagName.toLowerCase());
}

function wrapInRow(mathLayout: (InputRow | InputNode) | (InputRow | InputNode)[] | null): InputRow {
  if (mathLayout == null) {
    return { values: [] };
  }

  if (!Array.isArray(mathLayout)) {
    if (isInputRow(mathLayout)) {
      return mathLayout;
    }
    mathLayout = [mathLayout];
  }
  return {
    values: mathLayout.flatMap((v) => {
      if (isInputRow(v)) {
        return v.values;
      } else {
        return v;
      }
    }),
  };
}
