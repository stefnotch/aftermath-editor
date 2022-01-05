import { assert, assertUnreachable } from ".././assert";
import { MathIR } from "./math-ir";
import { expectNChildren, optionalWrapInRow } from "./math-ir-utils";
import {
  startingBrackets,
  endingBrackets,
  allBrackets,
  ambigousBrackets as eitherBrackets,
} from "./mathml-spec";

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

export function fromElement(element: HTMLElement) {
  assert(tagIs(element, "math"));

  return optionalWrapInRow(toMathIR(element));
}

const mathNamespace = "http://www.w3.org/1998/Math/MathML";
function createMathElement(tagName: MathMLTags, children: Node[]) {
  let element = document.createElementNS(mathNamespace, tagName);
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

// Time to iterate over the MathML and create a cute little tree
// Doesn't deal with horrible MathML yet (so stuff like unnecessary nested mrows is bad, maybe that should be a post-processing step?)
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
  } else if (tagIs(element, "mi", "mn")) {
    // TODO: Correctly get the text (this includes worthless spaces and such)
    let text = (element.textContent + "").trim();
    return text.split("").map((v) => {
      return {
        type: "symbol",
        value: v,
      };
    });
  } else if (tagIs(element, "mo")) {
    // TODO: Correctly get the text (this includes worthless spaces and such)
    let text = (element.textContent + "").trim();
    return text.split("").map((v) => {
      if (
        element.getAttribute("stretchy") != "false" &&
        allBrackets.has(text)
      ) {
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
        type: "frac",
        values: children.flatMap((c) => toMathIR(c)),
        count: 2,
      }
    );
  } else if (tagIs(element, "msqrt")) {
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
    return {
      type: "root",
      values: [
        optionalWrapInRow(toMathIR(children[1])),
        optionalWrapInRow(toMathIR(children[0])),
      ],
      count: 2,
    };
  } else if (tagIs(element, "msub")) {
    return (
      expectNChildren(element, 2) ?? [
        optionalWrapInRow(toMathIR(children[0])),
        {
          type: "sub",
          value: optionalWrapInRow(toMathIR(children[1])),
        },
      ]
    );
  } else if (tagIs(element, "msup")) {
    return (
      expectNChildren(element, 2) ?? [
        optionalWrapInRow(toMathIR(children[0])),
        {
          type: "sup",
          value: optionalWrapInRow(toMathIR(children[1])),
        },
      ]
    );
  } else if (tagIs(element, "msubsup")) {
    return (
      expectNChildren(element, 3) ?? [
        optionalWrapInRow(toMathIR(children[0])),
        {
          type: "sub",
          value: optionalWrapInRow(toMathIR(children[1])),
        },
        {
          type: "sup",
          value: optionalWrapInRow(toMathIR(children[2])),
        },
      ]
    );
  } else if (tagIs(element, "munder")) {
    return (
      expectNChildren(element, 2) ?? {
        type: "under",
        values: [
          optionalWrapInRow(toMathIR(children[0])),
          optionalWrapInRow(toMathIR(children[1])),
        ],
        count: 2,
      }
    );
  } else if (tagIs(element, "mover")) {
    return (
      expectNChildren(element, 2) ?? {
        type: "over",
        values: [
          optionalWrapInRow(toMathIR(children[0])),
          optionalWrapInRow(toMathIR(children[1])),
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
              optionalWrapInRow(toMathIR(children[0])),
              optionalWrapInRow(toMathIR(children[1])),
            ],
            count: 2,
          },
          optionalWrapInRow(toMathIR(children[2])),
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
        [...c.children].map((cc) => optionalWrapInRow(toMathIR(cc)))
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
    // TODO: Sometimes create a msqrt
    return createMathElement("mroot", [
      fromMathIR(mathIR.values[1]),
      fromMathIR(mathIR.values[0]),
    ]);
  } else if (mathIR.type == "row") {
    return createMathElement("mrow", fromMathIRRow(mathIR.values));
  } else if (mathIR.type == "sub" || mathIR.type == "sup") {
    return createMathElement("merror", [
      createMathElement("mtext", [
        document.createTextNode("Unexpected " + mathIR.type),
      ]),
    ]);
  } else if (mathIR.type == "symbol") {
    // TODO: stretchy=false
    // TODO: Remove extraneous row (but remember, we need the row parsing logic from above)
    let elements = fromMathIRRow([mathIR]);
    return elements.length == 1
      ? elements[0]
      : createMathElement("mrow", elements);
  } else if (mathIR.type == "bracket") {
    // TODO: Find the associated closing bracket
    // And then output <mrow>starting bracket <mrow></mrow> closing bracket</mrow>
    return createMathElement("mo", [document.createTextNode(mathIR.value)]);
  } else if (mathIR.type == "text") {
    return createMathElement("mtext", [document.createTextNode(mathIR.value)]);
  } else if (mathIR.type == "table") {
    return createMathElement(
      "mtable",
      mathIR.values.map((v) =>
        createMathElement(
          "mtr",
          v.map((cell) => {
            if (cell.type == "row") {
              // TODO: Remove extraneous row (but remember, we need the row parsing logic from above)
              return createMathElement("mtd", [fromMathIR(cell)]);
            } else {
              return createMathElement("mtd", [fromMathIR(cell)]);
            }
          })
        )
      )
    );
  } else {
    assertUnreachable(mathIR);
  }
}

/**
 * Parse all the children of a row, has some special logic
 */
function fromMathIRRow(mathIR: MathIR[]): Element[] {
  // That parsing needs to
  // - Parse numbers <mn> numbers go brr
  // - Parse variables <mi> everything else I guess
  // - Parse operators <mo> https://w3c.github.io/mathml-core/#operator-tables
  // - Put the sub and sup where they belong
  // - Does not really need to parse e, integral-dx and other stuff for now.
  //   Instead we'll expose some "parser" API to the user and let them deal with fun like "wait, what e is that"

  const isDigit = /^\p{Nd}+$/gu;

  let elements: Element[] = [];

  mathIR.values.forEach((v) => {
    if (v.type == "symbol") {
      // TODO: Don't create a new node for each digit
      if (isDigit.test(v.value)) {
        elements.push(
          createMathElement("mn", [document.createTextNode(v.value)])
        );
      } else if (
        elements.length > 0 &&
        elements[elements.length - 1].tagName.toLowerCase() == "mn"
      ) {
        // Quick hack for parsing dots
        elements.push(
          createMathElement("mn", [document.createTextNode(v.value)])
        );
      } else {
        // TODO: Might be an operator

        elements.push(
          createMathElement("mi", [document.createTextNode(v.value)])
        );
      }
    } else if (v.type == "sub" || v.type == "sup") {
      let lastElement = elements.pop();
      if (lastElement) {
        elements.push(
          createMathElement(v.type == "sub" ? "msub" : "msup", [
            lastElement,
            fromMathIR(v.value),
          ])
        );
      } else {
        // A lonely sub or sup is an error, we let this function deal with it
        elements.push(fromMathIR(v));
      }
    } else {
      // It's some other element
      elements.push(fromMathIR(v));
    }
  });
  return [];
}
