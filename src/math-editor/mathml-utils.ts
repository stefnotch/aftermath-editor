import { assert, assertUnreachable } from ".././assert";
import { MathIR } from "./math-ir";

export function fromElement(element: HTMLElement) {
  assert(tagIs(element, "math"));

  return flattenMathIR(toMathIR(element));
}

type MathMLTags =
  | "math"
  | "semantics"
  | "annotation"
  | "annotation-xml"
  | "mtext"
  | "mi"
  | "mn"
  | "mo"
  | "mspace"
  | "ms"
  | "mrow"
  | "mfrac"
  | "msqrt"
  | "mroot"
  | "mstyle"
  | "merror"
  | "maction"
  | "mpadded"
  | "mphantom"
  | "msub"
  | "msup"
  | "msubsup"
  | "munder"
  | "mover"
  | "munderover"
  | "mmultiscripts"
  | "none"
  | "mprescripts"
  | "mtable"
  | "mtr"
  | "mtd";

const mathNamespace = "http://www.w3.org/1998/Math/MathML";
function createMathElement(tagName: MathMLTags, children: Node[]) {
  let element = document.createElementNS(mathNamespace, "math");
  children.forEach((c) => {
    element.appendChild(c);
  });
  return element;
}

export function toElement(mathIR: MathIR): Element {
  let element = createMathElement("math", []);
  element.setAttributeNS(mathNamespace, "display", "block");
  element.setAttribute("style", "font-family: STIX Two");
  element.setAttribute("tabindex", "font-0");

  if (mathIR.type == "row") {
    element.append(...mathIR.values.map((v) => fromMathIR(v)));
  } else {
    element.append(fromMathIR(mathIR));
  }

  return element;
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
      value: (element.textContent + "").trim(),
    };
  } else if (tagIs(element, "mi", "mn", "mo")) {
    // TODO: Correctly get the text (this includes worthless spaces and such)
    let text = (element.textContent + "").trim();
    return text.split("").map((v) => {
      return {
        type: "symbol",
        value: v,
      };
    });
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

function fromMathIR(mathIR: MathIR): Element {
  if (mathIR.type == "error") {
    return createMathElement("merror", [
      createMathElement("mtext", [document.createTextNode(mathIR.value)]),
    ]);
  } else if (mathIR.type == "frac") {
    return createMathElement("mfrac", [
      fromMathIR(mathIR.values[0]),
      fromMathIR(mathIR.values[1]),
    ]);

    // Maybe detect under-over?
  } else if (mathIR.type == "over") {
    return createMathElement("mover", [
      fromMathIR(mathIR.values[0]),
      fromMathIR(mathIR.values[1]),
    ]);
  } else if (mathIR.type == "under") {
    return createMathElement("munder", [
      fromMathIR(mathIR.values[0]),
      fromMathIR(mathIR.values[1]),
    ]);
  } else if (mathIR.type == "root") {
    return createMathElement("mroot", [
      createMathElement("msqrt", [fromMathIR(mathIR.values[1])]),
      fromMathIR(mathIR.values[0]),
    ]);
  } else if (mathIR.type == "row") {
    // This one is too simplistic. Instead we need to go over the elements and do fansy parsing stuff
    return createMathElement(
      "mrow",
      mathIR.values.map((v) => fromMathIR(v))
    );
  } else if (mathIR.type == "sub") {
    // TODO:
  } else if (mathIR.type == "sup") {
    // TODO:
  } else if (mathIR.type == "symbol") {
    // TODO:
  } else if (mathIR.type == "text") {
    return createMathElement("mtext", [document.createTextNode(mathIR.value)]);
  } else {
    assertUnreachable(mathIR.type);
  }
}
