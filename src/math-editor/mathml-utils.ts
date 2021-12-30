import { assert, assertUnreachable } from ".././assert";
import { MathIR } from "./math-ir";

export function fromElement(element: HTMLElement) {
  assert(tagIs(element, "math"));

  return flattenMathIR(toMathIR(element));
}

function flattenMathIR(mathIR: MathIR | MathIR[]): MathIR {
  if (Array.isArray(mathIR)) {
    return {
      type: "row",
      values: mathIR,
    };
  } else {
    return mathIR;
  }
}

function expectNChildren(element: Element, n: number): MathIR | null {
  if (element.children.length != n) {
    return {
      type: "error",
      value: `Expected ${n} children in ${element.tagName.toLowerCase()}`,
    };
  }
  return null;
}

// Time to iterate over the MathML and create a cute little tree
// Doesn't deal with horrible MathML yet (so stuff like nested mrows is bad, maybe that should be a post-processing step?)
function toMathIR(element: Element): MathIR | MathIR[] {
  let children = [...element.children];

  if (tagIs(element, "math", "mrow", "mtd")) {
    // Uses flatMap so that msub can return two elements...
    return {
      type: "row",
      values: children.flatMap((c) => toMathIR(c)),
    };
  } else if (tagIs(element, "semantics") && children.length > 0) {
    return toMathIR(children[0]);
  } else if (tagIs(element, "mtext", "ms")) {
    return {
      type: "text",
      // TODO: Correctly get the text (this includes worthless spaces and such)
      value: element.textContent + "",
    };
  } else if (tagIs(element, "mi", "mn", "mo")) {
    return {
      type: "symbol",
      // TODO: Correctly get the text (this includes worthless spaces and such)
      value: element.textContent + "",
    };
  } else if (tagIs(element, "mfrac")) {
    return (
      expectNChildren(element, 2) ?? {
        type: "frac",
        values: children.flatMap((c) => toMathIR(c)),
        count: 2,
      }
    );
  } else if (tagIs(element, "msqrt")) {
    if (element.parentElement && tagIs(element.parentElement, "mroot")) {
      return {
        type: "error",
        value: "Should have parsed mroot instead",
      };
    }
    return {
      type: "root",
      values: [
        {
          type: "symbol",
          value: "2",
        },
        {
          type: "row",
          values: children.flatMap((c) => toMathIR(c)),
        },
      ],
      count: 2,
    };
  } else if (tagIs(element, "mroot")) {
    if (children.length != 2) {
      return { type: "error", value: "Not 2 children in root" };
    }
    if (!tagIs(children[0], "msqrt")) {
      return { type: "error", value: "Expected msqrt in mroot" };
    }
    return {
      type: "root",
      values: [
        flattenMathIR(toMathIR(children[1])),
        {
          type: "row",
          values: [...children[0].children].flatMap((c) => toMathIR(c)),
        },
      ],
      count: 2,
    };
  } else if (tagIs(element, "msub")) {
    return (
      expectNChildren(element, 2) ?? [
        flattenMathIR(toMathIR(children[0])),
        {
          type: "sub",
          value: flattenMathIR(toMathIR(children[1])),
        },
      ]
    );
  } else if (tagIs(element, "msup")) {
    return (
      expectNChildren(element, 2) ?? [
        flattenMathIR(toMathIR(children[0])),
        {
          type: "sup",
          value: flattenMathIR(toMathIR(children[1])),
        },
      ]
    );
  } else if (tagIs(element, "msubsup")) {
    return (
      expectNChildren(element, 3) ?? [
        flattenMathIR(toMathIR(children[0])),
        {
          type: "sub",
          value: flattenMathIR(toMathIR(children[1])),
        },
        {
          type: "sup",
          value: flattenMathIR(toMathIR(children[2])),
        },
      ]
    );
  } else if (tagIs(element, "munder")) {
    return (
      expectNChildren(element, 2) ?? {
        type: "under",
        values: [
          flattenMathIR(toMathIR(children[0])),
          flattenMathIR(toMathIR(children[1])),
        ],
        count: 2,
      }
    );
  } else if (tagIs(element, "mover")) {
    return (
      expectNChildren(element, 2) ?? {
        type: "over",
        values: [
          flattenMathIR(toMathIR(children[0])),
          flattenMathIR(toMathIR(children[1])),
        ],
        count: 2,
      }
    );
  } else if (tagIs(element, "munderover")) {
    return (
      expectNChildren(element, 3) ?? {
        type: "over",
        values: [
          {
            type: "under",
            values: [
              flattenMathIR(toMathIR(children[0])),
              flattenMathIR(toMathIR(children[1])),
            ],
            count: 2,
          },
          flattenMathIR(toMathIR(children[2])),
        ],
        count: 2,
      }
    );
  } else if (tagIs(element, "mtable")) {
    if (
      !children.every(
        (c) =>
          tagIs(c, "mtr") && [...c.children].every((cc) => tagIs(cc, "mtd"))
      )
    ) {
      return {
        type: "error",
        value: "Unexpected children " + element,
      };
    }

    // Can add some useless rows for each table cell
    // Maybe we should only generate a row if it's actually needed
    return {
      type: "table",
      values: children.map((c) =>
        [...c.children].map((cc) => flattenMathIR(toMathIR(cc)))
      ),
    };
  } else {
    return {
      type: "error",
      value: "Unknown element " + element,
    };
  }
}

/**
 * Checks if an element has a given tag name
 */
function tagIs(element: Element, ...tagNames: string[]): boolean {
  return tagNames.includes(element.tagName.toLowerCase());
}
