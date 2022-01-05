import { assert, assertUnreachable } from ".././assert";
import { MathIR } from "./math-ir";
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

  return flattenMathIR(toMathIR(element));
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
// Doesn't deal with horrible MathML yet (so stuff like unnecessary nested mrows is bad, maybe that should be a post-processing step?)
function toMathIR(element: Element): MathIR | MathIR[] {
  // Internal contract: Whenever we encounter a potential bracket, we emit a new type: bracket element

  type MathIRBrackets = MathIR & { type: "brackets" };

  function parseBrackets(
    elements: MathIR[],
    startingBracketIndex: number
  ): { endingBracketIndex: number; mathIR: MathIRBrackets } {
    const children = [] as MathIR[];

    const startingBracket = elements[startingBracketIndex];
    assert(startingBracket.type == "brackets");
    const startingBracketSymbol = startingBracket.values[0];
    assert(startingBracketSymbol.type == "symbol");

    for (let i = startingBracketIndex + 1; i < elements.length; i++) {
      const element = elements[i];
      if (element.type != "brackets") {
        children.push(element);
      } else {
        const bracketSymbol = element.values[0];
        assert(bracketSymbol.type == "symbol");

        if (startingBrackets.has(bracketSymbol.value)) {
          const parsed = parseBrackets(elements, i);
          i = parsed.endingBracketIndex + 1;
          children.push(parsed.mathIR);
        } else if (endingBrackets.has(bracketSymbol.value)) {
          const endingBracketSymbol = element.values[0];
          assert(endingBracketSymbol.type == "symbol");
          if (
            startingBrackets.get(startingBracketSymbol.value) !=
            endingBracketSymbol.value
          ) {
            children.push({
              type: "error",
              value: "Expected a different ending bracket",
            });
          }

          return {
            endingBracketIndex: i,
            mathIR: {
              type: "brackets",
              values: [
                startingBracketSymbol,
                children.length == 1 ? children[0] : flattenMathIR(children),
                endingBracketSymbol,
              ],
              count: 3,
            },
          };
        }
      }
    }
    // Apparently we didn't have a proper starting bracket
    return;
  }

  function makeMathIRRow(children: MathIR[]): MathIR {
    type BracketReference = {
      index: number;
      reference: MathIRBrackets;
      bracketType: "starting" | "either";
      value: string;
    };
    let bracketStack = [] as BracketReference[];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type != "brackets") continue;
      let bracketSymbol = child.values[0];
      assert(bracketSymbol.type == "symbol");

      if (startingBrackets.has(bracketSymbol.value)) {
        bracketStack.push({
          index: i,
          reference: child,
          bracketType: "starting",
          value: bracketSymbol.value,
        });
      } else if (endingBrackets.has(bracketSymbol.value)) {
        // Clear out the "either" brackets, they're just symbols
        while (true) {
          if (bracketStack.length <= 0) break;
          let top = bracketStack[bracketStack.length - 1];
          if (top.bracketType != "either") break;
          children[top.index] = top.reference.values[0];
        }
        // Take care of the starting bracket
        if (bracketStack.length <= 0) {
          children[i] = {
            type: "error",
            value: "Unexpected closing bracket",
          };
        } else {
          // Please get rid of the code duplication around here
          let opening = bracketStack.pop();
          assert(opening != undefined);
          assert(opening.reference.values.length == 1);
          assert(opening.bracketType == "starting");
          if (opening.value != endingBrackets.get(bracketSymbol.value)) {
            children[i] = {
              type: "error",
              value: "Expected a matching opening bracket",
            };
          } else {
            let insideBracket = children.splice(
              opening.index + 1,
              i - opening.index
            );
            opening.reference.values.push(
              insideBracket.length == 1
                ? insideBracket[0]
                : flattenMathIR(insideBracket)
            );
            opening.reference.values.push(bracketSymbol);
            i = opening.index;
          }
        }
      } else if (eitherBrackets.has(bracketSymbol.value)) {
        // Things like the absolute value bars
        if (
          bracketStack.length > 0 &&
          bracketStack[bracketStack.length - 1].bracketType == "either" &&
          bracketStack[bracketStack.length - 1].value == bracketSymbol.value
        ) {
          let opening = bracketStack.pop();
          assert(opening != undefined);
          assert(opening.reference.values.length == 1);
          let insideBracket = children.splice(
            opening.index + 1,
            i - opening.index
          );
          opening.reference.values.push(
            insideBracket.length == 1
              ? insideBracket[0]
              : flattenMathIR(insideBracket)
          );
          opening.reference.values.push(bracketSymbol);
          i = opening.index;
        } else {
          bracketStack.push({
            index: i,
            reference: child,
            bracketType: "either",
            value: bracketSymbol.value,
          });
        }
      } else {
        children[i] = {
          type: "error",
          value: "Illegal bracket, function did not honor internal contract",
        };
      }
    }

    return {
      type: "row",
      values: children,
    };
  }

  let children = [...element.children];

  if (tagIs(element, "math", "mrow", "mtd")) {
    // Uses flatMap so that msub can return two elements...
    return makeMathIRRow(children.flatMap((c) => toMathIR(c)));
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
          type: "brackets",
          values: [
            {
              type: "symbol",
              value: v,
            },
          ],
          count: 3,
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
        makeMathIRRow(children.flatMap((c) => toMathIR(c))),
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
        flattenMathIR(toMathIR(children[1])),
        flattenMathIR(toMathIR(children[0])),
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
    // TODO: Remove extraneous row (but remember, we need the row parsing logic from above)
    let elements = fromMathIRRow([mathIR]);
    return elements.length == 1
      ? elements[0]
      : createMathElement("mrow", elements);
  } else if (mathIR.type == "brackets") {
    return createMathElement("mrow", [
      fromMathIR(mathIR.values[0]),
      fromMathIR(mathIR.values[1]),
      fromMathIR(mathIR.values[2]),
    ]);
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
