import { assert, assertUnreachable } from "../utils/assert";
import {
  MathLayoutText,
  MathLayoutRow,
  MathLayoutElement,
  MathLayoutSymbol,
  MathLayoutTable,
  MathLayoutContainer,
} from "../math-layout/math-layout";
import { endingBrackets, allBrackets, MathMLTags } from "./mathml-spec";
import { TokenStream } from "../math-editor/token-stream";
import { Offset } from "../math-layout/math-layout-offset";
import { ViewportValue } from "../component/viewport-coordinate";
import {
  AncestorIndices,
  fromAncestorIndices,
  getAncestorIndices,
  MathLayoutRowZipper,
  MathLayoutTextZipper,
} from "../math-layout/math-layout-zipper";
import { tagIs } from "../utils/dom-utils";

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

  get length(): number {
    return this.value.values.length;
  }

  offsetToPosition(offset: Offset): { x: ViewportValue; y: ViewportValue; height: ViewportValue } {
    // https://github.com/stefnotch/mathml-editor/issues/15#issuecomment-1305718639

    // Special case for the end of the row
    // Also elegantly deals with empty rows
    if (offset >= this.value.values.length) {
      const finalBoundingBox = this.finalElement.getBoundingClientRect();
      return {
        x: finalBoundingBox.x + finalBoundingBox.width / 2,
        y: getBaseline(this.element),
        height: getFontSize(this.element),
      };
    }

    const child = this.children[offset];
    return {
      x: child.startEndPosition().start,
      y: getBaseline(this.element),
      height: getFontSize(this.element),
    };
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
  constructor(public readonly value: T, public readonly element: Element, public readonly textNode: Text) {}

  get type(): T["type"] {
    return this.value.type;
  }

  get length(): number {
    return this.value.value.length;
  }

  /**
   * Very slow, because it causes a reflow
   */
  offsetToPosition(offset: Offset): { x: ViewportValue; y: ViewportValue; height: ViewportValue } {
    const textBoundingBox = getTextLayout(this.textNode, offset);

    // This is a bit of a hack to get the nearest mrow so that we can get the baseline
    // See also https://github.com/w3c/mathml-core/issues/38
    let parentRow = this.element.parentElement;
    while (parentRow !== null && !tagIs(parentRow, "mrow")) {
      parentRow = parentRow.parentElement;
    }
    assert(parentRow !== null);
    return {
      x: textBoundingBox.x,
      y: getBaseline(parentRow),
      height: getFontSize(parentRow),
    };
  }

  startEndPosition(): { start: ViewportValue; end: ViewportValue } {
    return {
      start: this.offsetToPosition(0).x,
      end: this.offsetToPosition(this.value.value.length).x,
    };
  }
}

export class MathmlLayout {
  constructor(public readonly element: MathMLElement, public readonly domTranslator: MathRowDomTranslator) {}

  caretContainer(mathLayout: MathLayoutRowZipper | MathLayoutTextZipper): Element {
    const ancestorIndices = getAncestorIndices(mathLayout);
    return this.caretToDomTranslator(ancestorIndices).element;
  }

  caretToPosition(mathLayout: MathLayoutRowZipper | MathLayoutTextZipper, offset: Offset) {
    const ancestorIndices = getAncestorIndices(mathLayout);
    return this.caretToDomTranslator(ancestorIndices).offsetToPosition(offset);
  }

  positionToCaret(element: Element | Text, position: { x: ViewportValue; y: ViewportValue }, rootZipper: MathLayoutRowZipper) {
    const domAncestors = getDomAncestors(element, this.domTranslator.element);
    if (domAncestors[0] !== this.domTranslator.element) {
      // We aren't querying an element inside the MathML
      return null;
    }

    // We walk down the tree, each time attempting to find the correct node which has one of the DOM elements.
    const ancestorIndices = getAncestorIndicesFromDom(domAncestors, this.domTranslator);
    const domTranslator = this.caretToDomTranslator(ancestorIndices);
    console.log(domAncestors, ancestorIndices, domTranslator);

    const length = domTranslator.length;
    let closestDistance = Infinity;
    let closestIndex = 0;
    for (let i = 0; i <= length; i++) {
      const { x, y } = domTranslator.offsetToPosition(i);
      const distance = Math.hypot(x - position.x, y - position.y);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }

    return { zipper: fromAncestorIndices(rootZipper, ancestorIndices), offset: closestIndex };
  }

  private caretToDomTranslator(ancestorIndices: AncestorIndices) {
    let current:
      | MathRowDomTranslator
      | MathContainerDomTranslator
      | MathTableDomTranslator
      | MathSymbolDomTranslator
      | MathTextDomTranslator = this.domTranslator;
    for (const ancestorIndex of ancestorIndices) {
      assert("children" in current); // We could write better code, but this assertion will do for now
      current = current.children[ancestorIndex];
    }

    // We could write better code, but this assertion will do for now
    assert(current instanceof MathRowDomTranslator || current instanceof MathTextDomTranslator);
    return current;
  }
}

/**
 * Takes a MathLayout and returns a MathML DOM tree
 */
export function toElement(mathIR: MathLayoutRow): MathmlLayout {
  let { element, translator } = fromMathLayoutRow(mathIR);

  // Always wrap in a math element
  element = createMathElement("math", [element]);
  assert(element instanceof MathMLElement);

  return new MathmlLayout(element, translator);
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
    const element = createMathElement("merror", [createMathElement("mtext", [textNode])]);
    const translator = new MathTextDomTranslator(mathIR, element, textNode);
    return { element, translator };
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
    const element = createMathElement("mo", [textNode]);
    element.setAttribute("stretchy", "false");
    const translator = new MathSymbolDomTranslator(mathIR, textNode, 0);
    return { element, translator };
  } else if (mathIR.type == "text") {
    // TODO: Special styling for empty text
    const textNode = document.createTextNode(mathIR.value);
    const element = createMathElement("mtext", [textNode]);
    const translator = new MathTextDomTranslator(mathIR, element, textNode);
    return { element, translator };
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
        const pseudoBracket = createMathElement("mo", [textNode]);
        pseudoBracket.setAttribute("stretchy", "false");
        const translator = new MathSymbolDomTranslator(token, textNode, 0);
        output.push(pseudoBracket);
        translators.push(translator);
      } else {
        const textNode = document.createTextNode(token.value);
        const element = createMathElement("mi", [textNode]);
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
      // The sub-sup shouldn't share its mrow with the row below it
      const element = createMathElement("mrow", [parsedSubSup.element]);
      const translator = new MathContainerDomTranslator(token, element, [parsedSubSup.translator]);
      output.push(createMathElement(token.type == "sub" ? "msub" : "msup", [lastElement, element]));
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

function fromMathLayoutNumber(tokens: TokenStream<MathLayoutElement>): {
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
  assert(t.isConnected);
  const atEnd = index >= t.length;
  const boundingBox = !atEnd ? getTextBoundingBox(t, index) : getTextBoundingBox(t, Math.max(0, t.length - 1));

  return {
    x: boundingBox.x + (atEnd ? boundingBox.width : 0),
    y: boundingBox.bottom,
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
  assert(element.isConnected);
  const boundingBox = element.getBoundingClientRect();
  return {
    start: boundingBox.x,
    end: boundingBox.x + boundingBox.width,
  };
}

/**
 * Gets the text's baseline for a given element.
 */
function getBaseline(element: Element): ViewportValue {
  // One silly hack for getting the baseline is:
  // - get the bounding box of the parent
  // - insert a 0px element
  // - get its bounding box
  // - figure out where it is relative to the parent
  // See also https://github.com/w3c/mathml-core/issues/38
  const baselineReaderElement = createMathElement("mphantom", []);
  element.append(baselineReaderElement);
  const baseline = baselineReaderElement.getBoundingClientRect().bottom;
  baselineReaderElement.remove();
  return baseline;
}

function getFontSize(element: Element): ViewportValue {
  const fontSize = +globalThis.getComputedStyle(element).getPropertyValue("font-size").replace("px", "");
  assert(!isNaN(fontSize) && fontSize > 0);
  return fontSize;
}
/**
 * Returns an array with all ancestors and the element. Includes the root.
 */
function getDomAncestors(element: Element | Text, root: Element) {
  let current: Element | Text | null = element;

  const domAncestors: (Element | Text)[] = [];
  while (current !== null && current !== root) {
    domAncestors.push(current);
    current = current.parentElement;
  }
  if (current === root) {
    domAncestors.push(current);
  }
  domAncestors.reverse();

  return domAncestors;
}

/**
 * Walks down the DOM, and returns the ancestor indices up until a MathRowDomTranslator or a MathTextDomTranslator
 */
function getAncestorIndicesFromDom(domAncestors: (Element | Text)[], domTranslator: MathRowDomTranslator) {
  // TODO: Use satisfies here
  let current = domTranslator as MathRowDomTranslator | MathContainerDomTranslator | MathTableDomTranslator;
  let domAncestorsIndex = 0;
  const ancestorIndices: number[] = [];
  const nextAncestorIndices: number[] = [];
  while (true) {
    let childWithElement:
      | MathRowDomTranslator
      | MathContainerDomTranslator
      | MathTableDomTranslator
      | MathSymbolDomTranslator
      | MathTextDomTranslator
      | null = null;

    for (let i = 0; i < current.children.length; i++) {
      const child = current.children[i];
      const indexOfElement = domAncestors.indexOf(child.element, domAncestorsIndex);
      if (indexOfElement !== -1) {
        domAncestorsIndex = indexOfElement + 1;
        childWithElement = child;
        nextAncestorIndices.push(i);
        break;
      }
    }

    if (childWithElement === null) {
      break;
    } else if (childWithElement instanceof MathRowDomTranslator) {
      ancestorIndices.push(...nextAncestorIndices);
      nextAncestorIndices.length = 0;
      current = childWithElement;
    } else if (childWithElement instanceof MathTextDomTranslator) {
      // We only care about rows or text
      ancestorIndices.push(...nextAncestorIndices);
      nextAncestorIndices.length = 0;
      break;
    } else if (childWithElement instanceof MathSymbolDomTranslator) {
      // We don't want to walk down into the symbol
      break;
    } else {
      current = childWithElement;
    }
  }

  return ancestorIndices;
}
