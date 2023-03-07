import { assert, assertUnreachable } from "../utils/assert";
import {
  MathLayoutRow,
  MathLayoutElement,
  MathLayoutSymbol,
  MathLayoutTable,
  MathLayoutContainer,
} from "../math-layout/math-layout";
import { endingBrackets, allBrackets, MathMLTags } from "./mathml-spec";
import { TokenStream } from "../math-editor/token-stream";
import { Offset } from "../math-layout/math-layout-offset";
import { ViewportRect, ViewportValue } from "../component/viewport-coordinate";
import {
  AncestorIndices,
  fromAncestorIndices,
  getAncestorIndices,
  MathLayoutRowZipper,
} from "../math-layout/math-layout-zipper";
import { tagIs } from "../utils/dom-utils";
import { MathLayoutPosition } from "../math-layout/math-layout-position";

interface RowDomTranslator {
  readonly element: Element;
  readonly children: (MathContainerDomTranslator | MathTableDomTranslator | MathSymbolDomTranslator)[];
  readonly length: number;
  /**
   * Returns the position of the given offset in the row.
   * x, y are at the baseline of the row.
   * height is the height of the row, going up.
   * TODO: Maybe add a depth? Or tweak the height to be the height of the row, going down?
   */
  offsetToPosition(offset: Offset): { x: ViewportValue; y: ViewportValue; height: ViewportValue };
  getBounds(): ViewportRect;
}

class MathRowDomTranslator implements RowDomTranslator {
  constructor(
    readonly value: MathLayoutRow,
    public readonly element: Element,
    public readonly children: (MathContainerDomTranslator | MathTableDomTranslator | MathSymbolDomTranslator)[],
    public readonly finalElement: Element
  ) {
    assert(children.length >= value.values.length);
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

  getBounds(): ViewportRect {
    const bounds = this.element.getBoundingClientRect();
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
  }
}

class MathContainerDomTranslator {
  constructor(
    readonly value: MathLayoutContainer,
    public readonly element: Element,
    public readonly children: RowDomTranslator[]
  ) {
    assert(children.length === value.values.length);
  }

  startEndPosition(): { start: ViewportValue; end: ViewportValue } {
    return getElementLayoutStartEnd(this.element);
  }
}
class MathTableDomTranslator {
  constructor(readonly value: MathLayoutTable, public readonly element: Element, public readonly children: RowDomTranslator[]) {
    assert(children.length === value.values.length);
  }

  startEndPosition(): { start: ViewportValue; end: ViewportValue } {
    return getElementLayoutStartEnd(this.element);
  }
}

class MathSymbolDomTranslator {
  constructor(
    readonly value: MathLayoutSymbol,
    /**
     * The element that contains this symbol. Note that the element might be shared with another symbol.
     * Make sure to use the index to find the correct symbol.
     */
    public readonly element: Text,
    // TODO: This should be a range
    public readonly index: number
  ) {}

  get children() {
    return [];
  }

  startEndPosition(): { start: ViewportValue; end: ViewportValue } {
    return {
      start: getTextLayout(this.element, this.index).x,
      end: getTextLayout(this.element, this.index + 1).x,
    };
  }
}

/**
 * It's a bit special, due to the mismatch between MathLayout and MathML when it comes to text
 * TODO: Fix this
 */
class MathTextRowDomTranslator implements RowDomTranslator {
  // For now I'll just count the characters that the Text has, but in later implementations we can have a function
  // (As in, a reference to a static function that takes the element and gives me the character at a given position or something)
  constructor(
    public readonly value: MathLayoutContainer & { type: "text" },
    public readonly element: Element,
    public readonly textNode: Text
  ) {
    assert(value.values[0].values.every((v) => v.type === "symbol"));
  }

  get children() {
    return [];
  }

  get length(): number {
    return this.value.values[0].values.length;
  }

  /**
   * Very slow, because it causes a reflow
   */
  offsetToPosition(offset: Offset): { x: ViewportValue; y: ViewportValue; height: ViewportValue } {
    const textBoundingBox = getTextLayout(this.textNode, offset);

    // This is a bit of a hack to get the nearest mrow so that we can get the baseline
    // See also https://github.com/w3c/mathml-core/issues/38
    let parentRow = this.textNode.parentElement;
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
      end: this.offsetToPosition(this.value.values[0].values.length).x,
    };
  }

  getBounds(): ViewportRect {
    const bounds = getFullTextBoundingBox(this.textNode);
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
  }
}

export class MathmlLayout {
  constructor(public readonly element: MathMLElement, public readonly domTranslator: RowDomTranslator) {}

  getCaretContainer(mathLayout: MathLayoutRowZipper): Element {
    const ancestorIndices = getAncestorIndices(mathLayout);
    return this.caretToDomTranslator(ancestorIndices).element;
  }

  /**
   * Given a position in the layout, get the correct viewport position
   */
  layoutToViewportPosition(layoutPosition: MathLayoutPosition) {
    const ancestorIndices = getAncestorIndices(layoutPosition.zipper);
    return this.caretToDomTranslator(ancestorIndices).offsetToPosition(layoutPosition.offset);
  }

  /**
   * Given a DOM node and a position, find the closest offset in the row
   */
  elementToLayoutPosition(
    element: Element | Text,
    position: { x: ViewportValue; y: ViewportValue },
    rootZipper: MathLayoutRowZipper
  ) {
    const domAncestors = getDomAncestors(element, this.domTranslator.element);
    if (domAncestors[0] !== this.domTranslator.element) {
      // We aren't querying an element inside the MathML
      return null;
    }

    // get the relevant dom translator by looking at the dom
    const ancestorIndices = getAncestorIndicesFromDom(domAncestors, this.domTranslator);
    const domTranslator = this.caretToDomTranslator(ancestorIndices);

    // get the closest offset
    const offset = this.getClosestOffsetInRow(domTranslator, position);
    return new MathLayoutPosition(fromAncestorIndices(rootZipper, ancestorIndices), offset);
  }

  private getClosestOffsetInRow(domTranslator: RowDomTranslator, position: { x: ViewportValue; y: ViewportValue }) {
    const length = domTranslator.length;
    let closestDistance = Infinity;
    let closestOffset = 0;
    for (let i = 0; i <= length; i++) {
      const { x, y } = domTranslator.offsetToPosition(i);
      const distance = distanceToPoint(position, { x, y });
      if (distance < closestDistance) {
        closestDistance = distance;
        closestOffset = i;
      }
    }
    return closestOffset;
  }

  /**
   * Given only a position, find the closest offset in a row
   */
  viewportToLayoutPosition(position: { x: ViewportValue; y: ViewportValue }, rootZipper: MathLayoutRowZipper) {
    let roots = [{ domTranslator: this.domTranslator, zipper: rootZipper } as const];
    let closest: { readonly position: MathLayoutPosition | null; readonly distance: number } = {
      position: null,
      distance: Infinity,
    };

    while (roots.length > 0) {
      const row = roots.pop();
      assert(row !== undefined);

      // Ignore definitely worse distances
      if (distanceToRectangle(row.domTranslator.getBounds(), position) > closest.distance) {
        continue;
      }

      const offset = this.getClosestOffsetInRow(row.domTranslator, position);
      const viewportPosition = row.domTranslator.offsetToPosition(offset);
      const newClosest = {
        position: new MathLayoutPosition(row.zipper, offset),
        distance: distanceToSegment(
          position,
          { x: viewportPosition.x, y: viewportPosition.y },
          { x: viewportPosition.x, y: viewportPosition.y - viewportPosition.height }
        ),
      };

      if (newClosest.distance < closest.distance) {
        closest = newClosest;
      }

      row.domTranslator.children.forEach((containerChild, i) => {
        const containerChildZipper = row.zipper.children[i];
        containerChild.children.forEach((rowChild, j) => {
          const rowChildZipper = containerChildZipper.children[j];
          roots.push({ domTranslator: rowChild, zipper: rowChildZipper });
        });
      });
    }

    assert(closest.position !== null);
    return closest.position;
  }

  private caretToDomTranslator(ancestorIndices: AncestorIndices) {
    let current = this.domTranslator;
    for (const [containerChildIndex, rowChildIndex] of ancestorIndices) {
      const containerChild = current.children[containerChildIndex];
      assert("children" in containerChild);
      current = containerChild.children[rowChildIndex];
    }
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
  translator: MathContainerDomTranslator | MathTableDomTranslator | MathSymbolDomTranslator;
} {
  // this almost sort a feels like a monad hmmm
  // TODO: Ugly code duplication
  if (mathIR.type == "error") {
    // This one is a bit of a hack, but it's fine for now
    const textNode = document.createTextNode(mathIR.value);
    const element = createMathElement("merror", [createMathElement("mtext", [textNode])]);
    const translator = new MathSymbolDomTranslator(mathIR, textNode, 0);
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
  } /*else if (mathIR.type == "bracket") {
    const textNode = document.createTextNode(mathIR.value);
    const element = createMathElement("mo", [textNode]);
    element.setAttribute("stretchy", "false");
    const translator = new MathSymbolDomTranslator(mathIR, textNode, 0);
    return { element, translator };
  }*/ else if (mathIR.type === "text") {
    // This approach was chosen, because we want the best possible MathML output
    const childrenIR = mathIR.values[0].values;
    let text = "";
    for (const childIR of childrenIR) {
      assert(childIR.type === "symbol", "Unsupported text child type");
      text += childIR.value;
    }
    const textNode = text.length > 0 ? document.createTextNode(text) : createPlaceholder();
    const element = createMathElement("mtext", [textNode]);
    // TODO: I'm not certain if this is correct
    const textRowTranslator = new MathTextRowDomTranslator(mathIR, element, textNode);
    const translator = new MathContainerDomTranslator(mathIR, element, [textRowTranslator]);
    return { element, translator };
  } else if (mathIR.type === "table") {
    const width = mathIR.rowWidth;
    const rows: MathLayoutRow[][] = [];
    const childTranslators: RowDomTranslator[] = [];
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
  translators: (MathContainerDomTranslator | MathTableDomTranslator | MathSymbolDomTranslator)[];
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
  const translators: (MathContainerDomTranslator | MathTableDomTranslator | MathSymbolDomTranslator)[] = [];

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
    } else if (token.type == "sub" || token.type == "sup") {
      let lastElement = output.pop();
      if (!lastElement) {
        // No element to put the sub or sup on, so we create a placeholder
        lastElement = createMathElement("mtext", [createPlaceholder()]);
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
    const placeholder = createMathElement("mtext", [createPlaceholder()]);
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

function getFullTextBoundingBox(t: Text) {
  const range = document.createRange();
  range.selectNodeContents(t);
  return range.getBoundingClientRect();
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

class SkipQueue<T> {
  index = 0;
  values: readonly T[];
  constructor(values: readonly T[]) {
    this.values = values;
  }

  popNext(value: T): T | null {
    const nextIndex = this.values.indexOf(value, this.index);
    if (nextIndex !== -1) {
      this.index = nextIndex + 1;
      return this.values[nextIndex];
    }
    return null;
  }
}

/**
 * Walks down the DOM, and returns the ancestor indices until a MathRowDomTranslator
 */
function getAncestorIndicesFromDom(domAncestorsArray: (Element | Text)[], domTranslator: RowDomTranslator): AncestorIndices {
  const domAncestors = new SkipQueue(domAncestorsArray);
  // Walks down the domAncestors to find the next relevant DOM to MathLayout translator
  const getNextDeeperChild = <T extends RowDomTranslator | MathTableDomTranslator | MathContainerDomTranslator>(
    rowDomTranslater: T
  ) => {
    for (let i = 0; i < rowDomTranslater.children.length; i++) {
      const child: T["children"][number] = rowDomTranslater.children[i];
      const element = domAncestors.popNext(child.element);
      if (element !== null) {
        return {
          value: child,
          indexInParent: i,
        };
      }
    }
    return null;
  };
  let current = domTranslator;
  const ancestorIndices: [number, number][] = [];
  while (true) {
    const containerChild = getNextDeeperChild(current);
    if (containerChild === null) {
      break;
    }
    if (containerChild.value instanceof MathSymbolDomTranslator) {
      // We don't want to walk down into the symbol
      break;
    }

    const rowChild = getNextDeeperChild(containerChild.value);
    if (rowChild === null) {
      break;
    }

    ancestorIndices.push([containerChild.indexInParent, rowChild.indexInParent]);
  }

  return ancestorIndices;
}

function createPlaceholder() {
  return document.createTextNode("⬚");
}

type ViewportVector2 = { x: ViewportValue; y: ViewportValue };
/**
 * Minimum distance from a point to a rectangle. Returns 0 if the point is inside the rectangle.
 * Assumes the rectangle is axis-aligned.
 */
function distanceToRectangle(bounds: ViewportRect, position: ViewportVector2) {
  // https://stackoverflow.com/q/30545052/3492994

  const dx = Math.max(bounds.x - position.x, position.x - (bounds.x + bounds.width));
  const dy = Math.max(bounds.y - position.y, position.y - (bounds.y + bounds.height));

  return Math.sqrt(Math.max(0, dx) ** 2 + Math.max(0, dy) ** 2);
}

function distanceToPoint(a: { x: ViewportValue; y: ViewportValue }, b: { x: ViewportValue; y: ViewportValue }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function distanceToPointSquared(v: ViewportVector2, w: ViewportVector2) {
  return (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
}
function distanceToSegmentSquared(position: ViewportVector2, v: ViewportVector2, w: ViewportVector2) {
  // https://stackoverflow.com/a/1501725/3492994
  const EPSILON = 0.000001;
  const segmentLength = distanceToPointSquared(v, w);
  if (segmentLength < EPSILON) return distanceToPointSquared(position, v);
  let t = ((position.x - v.x) * (w.x - v.x) + (position.y - v.y) * (w.y - v.y)) / segmentLength;
  t = Math.max(0, Math.min(1, t));
  return distanceToPointSquared(position, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}
function distanceToSegment(position: ViewportVector2, v: ViewportVector2, w: ViewportVector2) {
  return Math.sqrt(distanceToSegmentSquared(position, v, w));
}
