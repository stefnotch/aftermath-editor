import { assert, assertUnreachable } from "../utils/assert";
import { MathLayout, MathLayoutText, MathLayoutRow, MathLayoutElement, MathPhysicalLayout } from "../math-layout/math-layout";
import { findEitherEndingBracket, findOtherBracket, wrapInRow } from "../math-layout/math-layout-utils";
import { startingBrackets, endingBrackets, allBrackets, ambigousBrackets as eitherBrackets } from "./mathml-spec";
import { TokenStream } from "./token-stream";
import { tagIs } from "../utils/dom-utils";

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

/**
 * Takes a MathLayout and returns a MathML DOM tree
 */
export function toElement(mathIR: MathLayoutRow): {
  element: MathMLElement;
  physicalLayout: MathPhysicalLayout;
  // TODO: Return something like https://github.com/stefnotch/mathml-editor/issues/15#issuecomment-1301763225
} {
  const physicalLayout: MathPhysicalLayout = new Map();
  const element = createMathElement("math", []);

  const emittedMathML = fromMathLayout(mathIR, physicalLayout);
  if (tagIs(emittedMathML, "mrow")) {
    // Remove duplicate mrow at the top
    element.append(...emittedMathML.childNodes);
  } else {
    element.append(emittedMathML);
  }

  assert(element instanceof MathMLElement);

  return {
    element,
    physicalLayout: physicalLayout,
  };
}

// Time to iterate over the MathML and create a cute little tree
// Doesn't deal with horrible MathML yet (so stuff like unnecessary nested mrows is bad, maybe that should be a post-processing step?)
function toMathLayout(element: Element): MathLayout | MathLayout[] {
  let children = [...element.children];

  if (tagIs(element, "math", "mrow", "mtd")) {
    // Uses flatMap so that msub can return two elements...
    return wrapInRow(children.flatMap((c) => toMathLayout(c)));
  } else if (tagIs(element, "semantics") && children.length > 0) {
    return toMathLayout(children[0]);
  } else if (tagIs(element, "mtext", "ms")) {
    return {
      type: "text",
      value: getText(element),
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
        value: "Unexpected children " + element,
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
      value: "Unknown element " + element,
    };
  }
}

function getTextBoundingBox(t: Text, index: number) {
  const range = document.createRange();
  range.setStart(t, index);
  if (t.length > 0) {
    range.setEnd(t, index + 1); // Select the entire character
  }
  return range.getBoundingClientRect();
}

function getTextLayout(t: Text, index: number) {
  const atEnd = index >= t.length;
  const boundingBox = !atEnd ? getTextBoundingBox(t, index) : getTextBoundingBox(t, Math.max(0, t.length - 1));

  return {
    x: boundingBox.x + (atEnd ? boundingBox.width : 0) + window.scrollX,
    y: boundingBox.y + window.scrollY,
    height: boundingBox.height,
  };
}

function getRowLayout(mathLayout: (() => DOMRect)[], index: number) {
  console.log("getRowLayout", index);
  assert(index <= mathLayout.length);
  const boundingBox = mathLayout[index]();

  return {
    x: boundingBox.x + window.scrollX,
    y: boundingBox.y + window.scrollY,
    height: boundingBox.height, // TODO: Use the script level or font size instead or the new "math-depth" CSS property
  };
}

function fromMathLayout(mathIR: MathLayout, physicalLayout: MathPhysicalLayout): Element {
  function setTextLayout(mathIR: MathLayoutText, textNode: Text): Text {
    physicalLayout?.set(mathIR, (index) => getTextLayout(textNode, index));
    return textNode;
  }

  function setRowLayout(mathIR: MathLayoutRow, mathLayout: (() => DOMRect)[]) {
    physicalLayout?.set(mathIR, (index) => getRowLayout(mathLayout, index));
  }

  if (mathIR.type == "error") {
    return createMathElement("merror", [
      createMathElement("mtext", [setTextLayout(mathIR, document.createTextNode(mathIR.value))]),
    ]);
  } else if (mathIR.type == "fraction") {
    return createMathElement("mfrac", [
      fromMathLayout(mathIR.values[0], physicalLayout),
      fromMathLayout(mathIR.values[1], physicalLayout),
    ]);

    // Maybe detect under-over?
  } else if (mathIR.type == "over") {
    return createMathElement("mover", [
      fromMathLayout(mathIR.values[0], physicalLayout),
      fromMathLayout(mathIR.values[1], physicalLayout),
    ]);
  } else if (mathIR.type == "under") {
    return createMathElement("munder", [
      fromMathLayout(mathIR.values[0], physicalLayout),
      fromMathLayout(mathIR.values[1], physicalLayout),
    ]);
  } else if (mathIR.type == "root") {
    // TODO: If it's a square root, make the 2 a bit lighter
    return createMathElement("mroot", [
      fromMathLayout(mathIR.values[1], physicalLayout),
      fromMathLayout(mathIR.values[0], physicalLayout),
    ]);
  } else if (mathIR.type == "row") {
    // TODO: Maybe don't emit every useless row
    const parsedChildren = fromMathLayoutRow(new TokenStream(mathIR.values, 0), physicalLayout);
    setRowLayout(mathIR, parsedChildren.mathLayout);
    return createMathElement("mrow", parsedChildren.elements);
  } else if (mathIR.type == "sub" || mathIR.type == "sup") {
    return createMathElement("merror", [createMathElement("mtext", [document.createTextNode("Unexpected " + mathIR.type)])]);
  } else if (mathIR.type == "symbol") {
    const parsedChildren = fromMathLayoutRow(new TokenStream([mathIR], 0), physicalLayout);
    return parsedChildren.elements.length == 1
      ? parsedChildren.elements[0]
      : createMathElement("mrow", parsedChildren.elements);
  } else if (mathIR.type == "bracket") {
    const element = createMathElement("mo", [document.createTextNode(mathIR.value)]);
    element.setAttribute("stretchy", "false");
    return element;
  } else if (mathIR.type == "text") {
    // TODO: Special styling for empty text
    return createMathElement("mtext", [setTextLayout(mathIR, document.createTextNode(mathIR.value))]);
  } else if (mathIR.type == "table") {
    const width = mathIR.width;
    const rows: MathLayoutRow[][] = [];
    // copy rows from mathIR.values into rows
    for (let i = 0; i < mathIR.values.length; i += width) {
      rows.push(mathIR.values.slice(i, i + width));
    }
    return createMathElement(
      "mtable",
      rows.map((row) =>
        createMathElement(
          "mtr",
          row.map((cell) => fromMathLayout(cell, physicalLayout))
        )
      )
    );
  } else {
    assertUnreachable(mathIR);
  }
}

// For starting a number
const isDigit = /^\p{Nd}+$/gu;
// For parsing a whole number
const isNumber = /^\p{Nd}+(\.\p{Nd}*)?$/gu;

/**
 * Parse all the children of a row, has some special logic
 */
function fromMathLayoutRow(
  tokens: TokenStream<MathLayout>,
  physicalLayout: MathPhysicalLayout
): {
  elements: Element[];
  mathLayout: (() => DOMRect)[];
} {
  // That parsing needs to
  // - Parse numbers <mn> numbers go brr
  // - Parse variables <mi> everything else I guess
  // - Parse operators <mo> https://w3c.github.io/mathml-core/#operator-tables
  // - Put the sub and sup where they belong
  // - Match brackets (opening - closing bracket pairs)
  // - Does not really need to parse e, integral-dx and other stuff for now.
  //   Instead we'll expose some "parser" API to the user and let them deal with fun like "wait, what e is that"

  const output: Element[] = [];
  const mathLayout: (() => DOMRect)[] = [];
  // TODO: Figure out where the baseline is (line-descent, line-ascent and that stuff)
  // Because you can't really rely on "look at where the next element is"
  // One silly hack for getting the baseline is:
  // - get the bounding box of the parent
  // - insert a 0px element
  // - get its bounding box
  // - figure out where it is relative to the parent

  function pushOutput(element: Element) {
    output.push(element);
    mathLayout.push(() => {
      assert(element.isConnected); // Element needs to be rendered for this to make sense
      return element.getBoundingClientRect();
    });
  }

  while (true) {
    const element = tokens.next();
    if (element === undefined) break;

    if (element.type == "symbol") {
      if (element.value.search(isDigit) != -1) {
        tokens.back();
        const parsed = fromMathLayoutNumber(tokens);
        output.push(parsed.element);
        mathLayout.push(...parsed.mathLayout);
      } else if (allBrackets.has(element.value)) {
        const pseudoBracket = createMathElement("mo", [document.createTextNode(element.value)]);
        pseudoBracket.setAttribute("stretchy", "false");
        pushOutput(pseudoBracket);
      } else {
        // TODO: Might be an operator
        // ⊥  is both a symbol (false) and an operator (A perpendicular B)

        pushOutput(createMathElement("mi", [document.createTextNode(element.value)]));
      }
    } else if (element.type == "bracket") {
      if (endingBrackets.has(element.value)) {
        pushOutput(fromMathLayout(element, physicalLayout)); // No opening bracket
      } else {
        // A starting bracket or an either bracket (funnily enough, the logic is almost the same for both)
        const endingBracketIndex = startingBrackets.has(element.value)
          ? findOtherBracket(tokens.value, tokens.offset - 1, "right")
          : findEitherEndingBracket(tokens.value, tokens.offset - 1);
        // TODO: maybe check if the ending bracket is actually the right type of bracket?
        if (endingBracketIndex == null) {
          pushOutput(fromMathLayout(element, physicalLayout)); // No closing bracket
        } else {
          const parsedChildren = fromMathLayoutRow(
            new TokenStream(tokens.value.slice(tokens.offset, endingBracketIndex), 0),
            physicalLayout
          );
          const endingBracket = tokens.value[endingBracketIndex];
          assert(endingBracket.type == "bracket");
          tokens.offset = endingBracketIndex + 1;
          const startingBracketElement = createMathElement("mo", [document.createTextNode(element.value)]);
          const endingBracketElement = createMathElement("mo", [document.createTextNode(endingBracket.value)]);
          output.push(
            createMathElement("mrow", [
              startingBracketElement,
              parsedChildren.elements.length == 1
                ? parsedChildren.elements[0]
                : createMathElement("mrow", parsedChildren.elements),
              endingBracketElement,
            ])
          );
          mathLayout.push(() => startingBracketElement.getBoundingClientRect());
          mathLayout.push(...parsedChildren.mathLayout);
          mathLayout.push(() => endingBracketElement.getBoundingClientRect());
        }
      }
    } else if (element.type == "sub" || element.type == "sup") {
      const lastElement = output.pop();
      if (lastElement) {
        const subSupElement = fromMathLayout(element.values[0], physicalLayout);
        mathLayout.push(() => {
          const boundingBox = lastElement.getBoundingClientRect();
          boundingBox.x += boundingBox.width;
          boundingBox.width = subSupElement.getBoundingClientRect().width;
          return boundingBox;
        });
        output.push(createMathElement(element.type == "sub" ? "msub" : "msup", [lastElement, subSupElement]));
      } else {
        // A lonely sub or sup is an error, we let this function deal with it
        pushOutput(fromMathLayout(element, physicalLayout));
      }
    } else {
      pushOutput(fromMathLayout(element, physicalLayout));
    }
  }

  // And push another last entry, since we can place a caret after the last one
  if (mathLayout.length > 0) {
    // TODO: use .at(-1)
    const lastEntry = mathLayout[mathLayout.length - 1];
    mathLayout.push(() => {
      const boundingBox = lastEntry();
      boundingBox.x += boundingBox.width;
      boundingBox.width = 0;
      return boundingBox;
    });
  } else {
    // Placeholder element, so that the row doesn't collapse to a zero-width
    const placeholder = createMathElement("mtext", [document.createTextNode("⬚")]);
    output.push(placeholder);
    mathLayout.push(() => {
      const boundingBox = placeholder.getBoundingClientRect();
      boundingBox.x += boundingBox.width / 2;
      boundingBox.width = 0;
      return boundingBox;
    });
  }

  return { elements: output, mathLayout: mathLayout };
}

function fromMathLayoutNumber(tokens: TokenStream<MathLayout>): {
  element: Element;
  mathLayout: (() => DOMRect)[];
} {
  const mathLayout: (() => DOMRect)[] = [];
  const firstDigit = tokens.next();
  assert(firstDigit?.type == "symbol");

  let digits = firstDigit.value;
  let count = 1;
  while (true) {
    const element = tokens.next();
    if (element === undefined) break;

    if (element.type == "symbol" && (digits + element.value).search(isNumber) != -1) {
      digits += element.value;
      count += 1;
    } else {
      tokens.back();
      break;
    }
  }

  const textNode = document.createTextNode(digits);
  for (let j = 0; j < count; j++) {
    mathLayout.push(() => getTextBoundingBox(textNode, j));
  }

  return {
    element: createMathElement("mn", [textNode]),
    mathLayout: mathLayout,
  };
}

export function expectNChildren(element: Element, n: number): MathLayout | null {
  if (element.children.length != n) {
    return {
      type: "error",
      value: `Expected ${n} children in ${element.tagName.toLowerCase()}`,
    };
  }
  return null;
}

const mathNamespace = "http://www.w3.org/1998/Math/MathML";
function createMathElement(tagName: MathMLTags, children: Node[]) {
  let element = document.createElementNS(mathNamespace, tagName);
  children.forEach((c) => {
    element.appendChild(c);
  });
  return element;
}

function getText(element: Element) {
  // Good enough for now
  return (element.textContent + "").trim();
}
