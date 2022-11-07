import { assert, assertUnreachable } from "../utils/assert";
import {
  MathLayout,
  MathLayoutText,
  MathLayoutRow,
  MathPhysicalLayout,
  MathLayoutElement,
  MathLayoutSymbol,
  MathLayoutTable,
  MathLayoutContainer,
} from "../math-layout/math-layout";
import { findEitherEndingBracket, findOtherBracket } from "../math-layout/math-layout-utils";
import { startingBrackets, endingBrackets, allBrackets, MathMLTags } from "./mathml-spec";
import { TokenStream } from "../math-editor/token-stream";
import { tagIs } from "../utils/dom-utils";
import { Offset } from "../math-layout/math-layout-offset";

// I am debating the usefulness of the generics here
interface MathDomTranslator<T extends { readonly type: string }, U extends Node> {
  readonly type: T["type"];
  readonly element: U;
}

class MathRowDomTranslator<T extends MathLayoutRow = MathLayoutRow> implements MathDomTranslator<T, Element> {
  constructor(
    public readonly value: T,
    public readonly element: Element,
    public readonly children: (
      | MathContainerDomTranslator
      | MathTableDomTranslator
      | MathSymbolDomTranslator
      | MathTextDomTranslator
    )[]
  ) {}

  get type(): T["type"] {
    return this.value.type;
  }
}

class MathContainerDomTranslator<T extends MathLayoutContainer = MathLayoutContainer> implements MathDomTranslator<T, Element> {
  constructor(public readonly value: T, public readonly element: Element, public readonly children: MathRowDomTranslator[]) {}

  get type(): T["type"] {
    return this.value.type;
  }
}

class MathTableDomTranslator<T extends MathLayoutTable = MathLayoutTable> implements MathDomTranslator<T, Element> {
  constructor(public readonly value: T, public readonly element: Element, public readonly children: MathRowDomTranslator[]) {}

  get type(): T["type"] {
    return this.value.type;
  }
}

class MathSymbolDomTranslator<T extends MathLayoutSymbol = MathLayoutSymbol> implements MathDomTranslator<T, Element> {
  constructor(public readonly value: MathLayoutSymbol, public readonly element: Element) {}

  get type(): T["type"] {
    return this.value.type;
  }
}

class MathTextDomTranslator<T extends MathLayoutText = MathLayoutText> implements MathDomTranslator<T, Text> {
  // For now I'll just count the characters that the Text has, but in later implementations we can have a function
  // (As in, a reference to a static function that takes the element and gives me the character at a given position or something)
  constructor(public readonly value: T, public readonly element: Text) {}

  get type(): T["type"] {
    return this.value.type;
  }
}

/**
 * Yay monads!
 * https://blog.jcoglan.com/2011/03/05/translation-from-haskell-to-javascript-of-selected-portions-of-the-best-introduction-to-monads-ive-ever-read/
 */
type TranslatorWithElement<T extends MathDomTranslator<any, any>> = {
  translators: T[];
  element: Element;
};

/**
 * Takes a MathLayout and returns a MathML DOM tree
 */
export function toElement(mathIR: MathLayoutRow): {
  element: MathMLElement;
  physicalLayout: MathPhysicalLayout;
  mathDomTranslator: MathRowDomTranslator;
} {
  let { element, translator } = fromMathLayoutRow(mathIR);

  // Always wrap in a math element
  element = createMathElement("math", [element]);
  assert(element instanceof MathMLElement);

  return {
    element,
    physicalLayout: null as any, // TODO: Replace with a dummy implementation that queries the translator
    mathDomTranslator: translator,
  };
}

function fromMathLayoutRow(mathIR: MathLayoutRow): { element: Element; translator: MathRowDomTranslator } {
  if (mathIR.type === "row") {
    const parsedChildren = fromMathLayoutRowChildren(new TokenStream(mathIR.values, 0));
    setRowLayout(mathIR, parsedChildren.mathLayout);
    const element = createMathElement("mrow", parsedChildren.elements);
    return {
      element,
      translator: new MathRowDomTranslator(mathIR, element, children),
    };
  } else {
    assertUnreachable(mathIR.type);
  }
}

function fromMathLayoutElement<T extends MathLayoutElement>(mathIR: T): { element: Element; translator: MathDomTranslator<T> } {
  function setTextLayout(mathIR: MathLayoutText, textNode: Text): Text {
    physicalLayout?.set(mathIR, (index) => getTextLayout(textNode, index));
    return textNode;
  }

  function setRowLayout(mathIR: MathLayoutRow, mathLayout: (() => DOMRect)[]) {
    physicalLayout?.set(mathIR, (index) => getRowLayout(mathLayout, index));
  }

  // this almost sort a feels like a monad hmmm
  if (mathIR.type == "error") {
    const textNode = document.createTextNode(mathIR.value);
    const translator = new MathTextDomTranslator(mathIR, textNode);
    return { element: createMathElement("merror", [createMathElement("mtext", [textNode])]), translator };
  } else if (mathIR.type == "fraction") {
    const childA = fromMathLayoutRow(mathIR.values[0]);
    const childB = fromMathLayoutRow(mathIR.values[1]);
    const element = createMathElement("mfrac", [childA.element, childB.element]);
    const translator = new MathContainerDomTranslator(mathIR, element, [childA.translator, childB.translator]);
    return { element, translator };
    // Maybe detect under-over?
  } else if (mathIR.type == "over") {
    return createMathElement("mover", [
      fromMathLayout(mathIR.values[0], physicalLayout, domRanges),
      fromMathLayout(mathIR.values[1], physicalLayout, domRanges),
    ]);
  } else if (mathIR.type == "under") {
    return createMathElement("munder", [
      fromMathLayout(mathIR.values[0], physicalLayout, domRanges),
      fromMathLayout(mathIR.values[1], physicalLayout, domRanges),
    ]);
  } else if (mathIR.type == "root") {
    // TODO: If it's a square root, make the 2 a bit lighter
    return createMathElement("mroot", [
      fromMathLayout(mathIR.values[1], physicalLayout, domRanges),
      fromMathLayout(mathIR.values[0], physicalLayout, domRanges),
    ]);
  } else if (mathIR.type == "row") {
    const parsedChildren = fromMathLayoutRowChildren(new TokenStream(mathIR.values, 0), physicalLayout, domRanges);
    setRowLayout(mathIR, parsedChildren.mathLayout);
    return createMathElement("mrow", parsedChildren.elements, domRanges);
  } else if (mathIR.type == "sub" || mathIR.type == "sup") {
    return createMathElement("merror", [createMathElement("mtext", [document.createTextNode("Unexpected " + mathIR.type)])]);
  } else if (mathIR.type == "symbol") {
    const parsedChildren = fromMathLayoutRowChildren(new TokenStream([mathIR], 0), physicalLayout, domRanges);
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
          row.map((cell) => createMathElement("mtd", [fromMathLayout(cell, physicalLayout, domRanges)]))
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
function fromMathLayoutRowChildren(tokens: TokenStream<MathLayout>): {
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
    const { value: element, index: elementIndex } = tokens.nextWithIndex();
    if (element === undefined) break;

    if (element.type == "symbol") {
      // TODO: Replace with correct parser
      if (element.value.search(isDigit) != -1) {
        tokens.back();
        const parsed = fromMathLayoutNumber(tokens, domRanges);
        output.push(parsed.element);
        mathLayout.push(...parsed.mathLayout);
      } else if (allBrackets.has(element.value)) {
        const pseudoBracket = createMathElement("mo", [document.createTextNode(element.value)], domRanges, {
          indexInParent: elementIndex,
        });
        pseudoBracket.setAttribute("stretchy", "false");
        pushOutput(pseudoBracket);
      } else {
        pushOutput(
          createMathElement("mi", [document.createTextNode(element.value)], domRanges, {
            indexInParent: elementIndex,
          })
        );
      }
    } else if (element.type == "bracket") {
      if (endingBrackets.has(element.value)) {
        pushOutput(fromMathLayout(element, physicalLayout, domRanges)); // No opening bracket
      } else {
        // A starting bracket or an either bracket (funnily enough, the logic is almost the same for both)
        const endingBracketIndex = startingBrackets.has(element.value)
          ? findOtherBracket(tokens.value, tokens.offset - 1, "right")
          : findEitherEndingBracket(tokens.value, tokens.offset - 1);
        // TODO: maybe check if the ending bracket is actually the right type of bracket?
        if (endingBracketIndex == null) {
          pushOutput(fromMathLayout(element, physicalLayout, domRanges)); // No closing bracket
        } else {
          const parsedChildren = fromMathLayoutRowChildren(
            new TokenStream(tokens.value.slice(tokens.offset, endingBracketIndex), 0),
            physicalLayout,
            domRanges
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
        const subSupElement = fromMathLayout(element.values[0], physicalLayout, domRanges);
        mathLayout.push(() => {
          const boundingBox = lastElement.getBoundingClientRect();
          boundingBox.x += boundingBox.width;
          boundingBox.width = subSupElement.getBoundingClientRect().width;
          return boundingBox;
        });
        output.push(createMathElement(element.type == "sub" ? "msub" : "msup", [lastElement, subSupElement]));
      } else {
        // A lonely sub or sup is an error, we let this function deal with it
        pushOutput(fromMathLayout(element, physicalLayout, domRanges));
      }
    } else {
      pushOutput(fromMathLayout(element, physicalLayout, domRanges));
    }
  }

  // And push another last entry, since we can place a caret after the last one
  if (mathLayout.length > 0) {
    // TODO: Not sure if we'll still need this
    const lastEntry = mathLayout[mathLayout.length - 1];
    mathLayout.push(() => {
      const boundingBox = lastEntry();
      boundingBox.x += boundingBox.width;
      boundingBox.width = 0;
      return boundingBox;
    });
  } else {
    // Placeholder element, so that the row doesn't collapse to a zero-width
    const placeholder = createMathElement("mtext", [document.createTextNode("⬚")], domRanges, {
      to: 0,
      from: 0,
      indexInParent: null,
    });
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

function fromMathLayoutNumber(
  tokens: TokenStream<MathLayout>,
  domRanges: MathDomRanges
): {
  element: Element;
  mathLayout: (() => DOMRect)[];
} {
  const mathLayout: (() => DOMRect)[] = [];
  const { value: firstDigit, index: from } = tokens.nextWithIndex();
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
    // TODO: here we've got an interesting case. It doesn't cleanly map to the MathLayout.
    element: createMathElement("mn", [textNode], domRanges, { indexInParent: null, from, to: from + count }),
    mathLayout: mathLayout,
  };
}

function getTextBoundingBox(t: Text, index: number) {
  const range = document.createRange();
  range.setStart(t, index);
  if (t.length > 0) {
    range.setEnd(t, index + 1); // Select the entire character
  }
  return range.getBoundingClientRect();
}

const mathNamespace = "http://www.w3.org/1998/Math/MathML";
function createMathElement(tagName: MathMLTags, children: Node[]) {
  const element = document.createElementNS(mathNamespace, tagName);
  children.forEach((c) => {
    element.appendChild(c);
  });
  return element;
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

/**
 * Turns a simple MathDomTranslator into a "wrapped" one where I can easily build an element tree around it.
 */
function unitTranslatorWithElement<T extends MathDomTranslator<any, any>>(translator: T): TranslatorWithElement<T> {
  return {
    translators: [translator],
    element: translator.element,
  };
}

function createTranslatorWithElement<T extends MathDomTranslator<any, any>>(
  tagName: MathMLTags,
  children: TranslatorWithElement<T>[]
): TranslatorWithElement<T> {
  return {
    translators: value.translator,
    element: translator.element,
  };
}
