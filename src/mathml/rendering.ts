import { assert, assertUnreachable } from "../utils/assert";
import {
  MathLayout,
  MathLayoutText,
  MathLayoutRow,
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
import { ViewportValue } from "../component/viewport-coordinate";
import {
  getAncestorIndices,
  MathLayoutContainerZipper,
  MathLayoutRowZipper,
  MathLayoutTableZipper,
  MathLayoutTextZipper,
} from "../math-layout/math-layout-zipper";

// I am debating the usefulness of the generics here
interface MathDomTranslator<T extends { readonly type: string }> {
  readonly type: T["type"];
}

class MathRowDomTranslator<T extends MathLayoutRow = MathLayoutRow> implements MathDomTranslator<T> {
  constructor(
    public readonly value: T,
    public readonly element: Element,
    public readonly children: (
      | MathContainerDomTranslator
      | MathTableDomTranslator
      | MathSymbolDomTranslator
      | MathTextDomTranslator
    )[],
    public readonly finalElement: Element
  ) {
    assert(children.length >= value.values.length);
  }

  get type(): T["type"] {
    return this.value.type;
  }

  offsetToPosition(offset: Offset): { x: ViewportValue; y: ViewportValue; height: ViewportValue } {
    // https://github.com/stefnotch/mathml-editor/issues/15#issuecomment-1305718639

    // Special case for the end of the row
    // Also elegantly deals with empty rows
    if (offset >= this.children.length) {
      const finalBoundingBox = this.finalElement.getBoundingClientRect();
      return {
        x: finalBoundingBox.x + finalBoundingBox.width / 2 + window.scrollX,
        y: this.baseline(),
        height: this.caretHeight(),
      };
    }

    const child = this.children[offset];
    return {
      x: child.startEndPosition().start,
      y: this.baseline(),
      height: this.caretHeight(),
    };
  }

  private baseline(): ViewportValue {
    // TODO: Get the correct baseline for this mrow

    // TODO: Figure out where the baseline is (line-descent, line-ascent and that stuff)
    // Because you can't really rely on "look at where the next element is"
    // One silly hack for getting the baseline is:
    // - get the bounding box of the parent
    // - insert a 0px element
    // - get its bounding box
    // - figure out where it is relative to the parent
    return this.element.getBoundingClientRect().bottom + window.scrollY;
  }

  private caretHeight(): ViewportValue {
    // TODO: Get the correct height for this mrow
    return 20;
  }

  startEndPosition(): { start: ViewportValue; end: ViewportValue } {
    return getElementLayoutStartEnd(this.element);
  }
}

class MathContainerDomTranslator<T extends MathLayoutContainer = MathLayoutContainer> implements MathDomTranslator<T> {
  constructor(public readonly value: T, public readonly element: Element, public readonly children: MathRowDomTranslator[]) {
    assert(children.length === value.values.length);
  }

  get type(): T["type"] {
    return this.value.type;
  }

  startEndPosition(): { start: ViewportValue; end: ViewportValue } {
    return getElementLayoutStartEnd(this.element);
  }
}

class MathTableDomTranslator<T extends MathLayoutTable = MathLayoutTable> implements MathDomTranslator<T> {
  constructor(public readonly value: T, public readonly element: Element, public readonly children: MathRowDomTranslator[]) {
    assert(children.length === value.values.length);
  }

  get type(): T["type"] {
    return this.value.type;
  }

  startEndPosition(): { start: ViewportValue; end: ViewportValue } {
    return getElementLayoutStartEnd(this.element);
  }
}

class MathSymbolDomTranslator<T extends MathLayoutSymbol = MathLayoutSymbol> implements MathDomTranslator<T> {
  constructor(
    public readonly value: MathLayoutSymbol,
    /**
     * The element that contains this symbol. Note that the element might be shared with another symbol.
     * Make sure to use the index to find the correct symbol.
     */
    public readonly element: Text,
    // TODO: This should be a range
    public readonly index: number
  ) {}

  get type(): T["type"] {
    return this.value.type;
  }

  startEndPosition(): { start: ViewportValue; end: ViewportValue } {
    return {
      start: getTextLayout(this.element, this.index).x,
      end: getTextLayout(this.element, this.index + 1).x,
    };
  }
}

class MathTextDomTranslator<T extends MathLayoutText = MathLayoutText> implements MathDomTranslator<T> {
  // For now I'll just count the characters that the Text has, but in later implementations we can have a function
  // (As in, a reference to a static function that takes the element and gives me the character at a given position or something)
  constructor(public readonly value: T, public readonly element: Text) {}

  get type(): T["type"] {
    return this.value.type;
  }

  offsetToPosition(offset: Offset): { x: ViewportValue; y: ViewportValue; height: ViewportValue } {
    return getTextLayout(this.element, offset);
  }

  startEndPosition(): { start: ViewportValue; end: ViewportValue } {
    return {
      start: this.offsetToPosition(0).x,
      end: this.offsetToPosition(this.value.value.length).x,
    };
  }
}

// TODO: Remove/refactor this
// The index has a different meaning depending on the element (child index, ignored, text index, 2D index)
export type MathPhysicalLayout = Map<
  MathLayoutRowZipper | MathLayoutTextZipper, // row-container
  (index: number) => { x: ViewportValue; y: ViewportValue; height: number }
>;

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
    physicalLayout: {
      // TODO: Refactor this prototype implementation that queries the translator
      get(mathLayout: MathLayoutRowZipper | MathLayoutTextZipper) {
        return (index: Offset) => {
          const ancestorIndices = getAncestorIndices(mathLayout);

          let current:
            | MathRowDomTranslator
            | MathContainerDomTranslator
            | MathTableDomTranslator
            | MathSymbolDomTranslator
            | MathTextDomTranslator = translator;
          for (const ancestorIndex of ancestorIndices) {
            assert("children" in current); // We could write better code, but this assertion will do for now
            current = current.children[ancestorIndex];
          }

          // We could write better code, but this assertion will do for now
          assert(current instanceof MathRowDomTranslator || current instanceof MathTextDomTranslator);
          return current.offsetToPosition(index);
        };
      },
    } as any,
    mathDomTranslator: translator,
  };
}

function fromMathLayoutRow(mathIR: MathLayoutRow): { element: Element; translator: MathRowDomTranslator } {
  if (mathIR.type === "row") {
    const parsedChildren = fromMathLayoutRowChildren(new TokenStream(mathIR.values, 0));
    const element = createMathElement("mrow", parsedChildren.elements);
    const finalElement = parsedChildren.elements.at(-1);
    assert(finalElement !== undefined);
    return {
      element,
      translator: new MathRowDomTranslator(mathIR, element, parsedChildren.translators, finalElement),
    };
  } else {
    assertUnreachable(mathIR.type);
  }
}

function fromMathLayoutElement<T extends MathLayoutElement>(
  // A few things are excluded for now and are being handled by fromMathLayoutRow
  mathIR: Exclude<T, { type: "sub" } | { type: "sup" } | { type: "symbol" }>
): {
  element: Element;
  translator: MathContainerDomTranslator | MathTableDomTranslator | MathSymbolDomTranslator | MathTextDomTranslator;
} {
  // this almost sort a feels like a monad hmmm
  // TODO: Ugly code duplication
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
    const childA = fromMathLayoutRow(mathIR.values[0]);
    const childB = fromMathLayoutRow(mathIR.values[1]);
    const element = createMathElement("mover", [childA.element, childB.element]);
    const translator = new MathContainerDomTranslator(mathIR, element, [childA.translator, childB.translator]);
    return { element, translator };
  } else if (mathIR.type == "under") {
    const childA = fromMathLayoutRow(mathIR.values[0]);
    const childB = fromMathLayoutRow(mathIR.values[1]);
    const element = createMathElement("munder", [childA.element, childB.element]);
    const translator = new MathContainerDomTranslator(mathIR, element, [childA.translator, childB.translator]);
    return { element, translator };
  } else if (mathIR.type == "root") {
    // TODO: If it's a square root, make the 2 a bit lighter
    const childA = fromMathLayoutRow(mathIR.values[0]);
    const childB = fromMathLayoutRow(mathIR.values[1]);
    // Notice the swapped order for rendering here
    const element = createMathElement("mroot", [childB.element, childA.element]);
    const translator = new MathContainerDomTranslator(mathIR, element, [childA.translator, childB.translator]);
    return { element, translator };
  } else if (mathIR.type == "bracket") {
    const textNode = document.createTextNode(mathIR.value);
    const element = createMathElement("mo", [document.createTextNode(mathIR.value)]);
    element.setAttribute("stretchy", "false");
    const translator = new MathSymbolDomTranslator(mathIR, textNode, 0);
    return { element, translator };
  } else if (mathIR.type == "text") {
    // TODO: Special styling for empty text
    const textNode = document.createTextNode(mathIR.value);
    const translator = new MathTextDomTranslator(mathIR, textNode);
    return { element: createMathElement("mtext", [textNode]), translator };
  } else if (mathIR.type == "table") {
    const width = mathIR.width;
    const rows: MathLayoutRow[][] = [];
    const childTranslators: MathRowDomTranslator[] = [];
    // copy rows from mathIR.values into rows
    for (let i = 0; i < mathIR.values.length; i += width) {
      rows.push(mathIR.values.slice(i, i + width));
    }
    const element = createMathElement(
      "mtable",
      rows.map((row) =>
        createMathElement(
          "mtr",
          row.map((cell) => {
            const cellWithElement = fromMathLayoutRow(cell);
            childTranslators.push(cellWithElement.translator);
            return createMathElement("mtd", [cellWithElement.element]);
          })
        )
      )
    );
    const translator = new MathTableDomTranslator(mathIR, element, childTranslators);
    return { element, translator };
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
function fromMathLayoutRowChildren(tokens: TokenStream<MathLayoutElement>): {
  elements: Element[];
  translators: (MathContainerDomTranslator | MathTableDomTranslator | MathSymbolDomTranslator | MathTextDomTranslator)[];
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
  const translators: (MathContainerDomTranslator | MathTableDomTranslator | MathSymbolDomTranslator | MathTextDomTranslator)[] =
    [];

  while (true) {
    const { value: token } = tokens.nextWithIndex();
    if (token === undefined) break;

    if (token.type == "symbol") {
      // TODO: Replace with correct parser
      if (token.value.search(isDigit) != -1) {
        tokens.back();
        const parsed = fromMathLayoutNumber(tokens);
        output.push(parsed.element);
        translators.push(...parsed.translators);
      } else if (allBrackets.has(token.value)) {
        // Bit of code duplication, but it's fine since I'm ripping this out later anyways or something
        const textNode = document.createTextNode(token.value);
        const pseudoBracket = createMathElement("mo", [document.createTextNode(token.value)]);
        pseudoBracket.setAttribute("stretchy", "false");
        const translator = new MathSymbolDomTranslator(token, textNode, 0);
        output.push(pseudoBracket);
        translators.push(translator);
      } else {
        const textNode = document.createTextNode(token.value);
        const element = createMathElement("mi", [document.createTextNode(token.value)]);
        element.setAttribute("stretchy", "false");
        const translator = new MathSymbolDomTranslator(token, textNode, 0);
        output.push(element);
        translators.push(translator);
      }
    } else if (token.type == "bracket") {
      if (endingBrackets.has(token.value) || true /*TODO: Remove || true and reimplement commented out code */) {
        // No opening bracket
        const parsed = fromMathLayoutElement(token);
        output.push(parsed.element);
        translators.push(parsed.translator);
      } else {
        /*
        Commented out code:

        // A starting bracket or an either bracket (funnily enough, the logic is almost the same for both)
        const endingBracketIndex = startingBrackets.has(token.value)
          ? findOtherBracket(tokens.value, tokens.offset - 1, "right")
          : findEitherEndingBracket(tokens.value, tokens.offset - 1);
        // TODO: maybe check if the ending bracket is actually the right type of bracket?
        if (endingBracketIndex == null) {
          pushOutput(fromMathLayoutElement(token)); // No closing bracket
        } else {
          const parsedChildren = fromMathLayoutRowChildren(
            new TokenStream(tokens.value.slice(tokens.offset, endingBracketIndex), 0)
          );
          const endingBracket = tokens.value[endingBracketIndex];
          assert(endingBracket.type == "bracket");
          tokens.offset = endingBracketIndex + 1;
          const startingBracketElement = createMathElement("mo", [document.createTextNode(token.value)]);
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
        }*/
      }
    } else if (token.type == "sub" || token.type == "sup") {
      let lastElement = output.pop();
      if (!lastElement) {
        // No element to put the sub or sup on, so we create a placeholder
        lastElement = createMathElement("mtext", [document.createTextNode("⬚")]);
      }
      const parsedSubSup = fromMathLayoutRow(token.values[0]);
      const translator = new MathContainerDomTranslator(token, parsedSubSup.element, [parsedSubSup.translator]);
      output.push(createMathElement(token.type == "sub" ? "msub" : "msup", [lastElement, parsedSubSup.element]));
      translators.push(translator);
    } else {
      const parsed = fromMathLayoutElement(token);
      output.push(parsed.element);
      translators.push(parsed.translator);
    }
  }

  // And push another last entry, since we can place a caret after the last one
  if (output.length > 0) {
    // We still need this, because fromMathLayoutRow takes the last child and uses it as that specially treated "finalElement"
    const dummyElement = createMathElement("mphantom", []);
    output.push(dummyElement);
  } else {
    // Placeholder element, so that the row doesn't collapse to a zero-width
    const placeholder = createMathElement("mtext", [document.createTextNode("⬚")]);
    output.push(placeholder);
  }

  return { elements: output, translators };
}

function fromMathLayoutNumber(tokens: TokenStream<MathLayout>): {
  element: Element;
  translators: MathSymbolDomTranslator[];
} {
  const symbolTokens: MathLayoutSymbol[] = [];
  const firstDigit = tokens.next();
  assert(firstDigit?.type == "symbol");
  symbolTokens.push(firstDigit);

  let digits = firstDigit.value;
  while (true) {
    const token = tokens.next();
    if (token === undefined) break;

    if (token.type == "symbol" && (digits + token.value).search(isNumber) != -1) {
      digits += token.value;
      symbolTokens.push(token);
    } else {
      tokens.back();
      break;
    }
  }

  const textNode = document.createTextNode(digits);
  const element = createMathElement("mn", [textNode]);
  const translators: MathSymbolDomTranslator[] = symbolTokens.map(
    (symbolToken, i) => new MathSymbolDomTranslator(symbolToken, textNode, i)
  );

  return {
    element: element,
    translators,
  };
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

function getTextBoundingBox(t: Text, index: number) {
  const range = document.createRange();
  range.setStart(t, index);
  if (t.length > 0) {
    range.setEnd(t, index + 1); // Select the entire character
  }
  return range.getBoundingClientRect();
}

function getElementLayoutStartEnd(element: Element) {
  const boundingBox = element.getBoundingClientRect();
  return {
    start: boundingBox.x + window.scrollX,
    end: boundingBox.x + boundingBox.width + window.scrollX,
  };
}
