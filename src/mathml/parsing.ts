import { assert } from "../utils/assert";
import { InputNode, InputNodeContainer, InputNodeSymbol } from "../input-tree/input-node";
import { InputRow } from "../input-tree/row";
import { InputTree } from "../input-tree/input-tree";
/**
 * Takes a MathML DOM tree and returns a MathLayout
 * TODO: A parser should specify which syntax it emits. (e.g. Emits quoted strings)
 */
export function fromElement(element: HTMLElement | MathMLElement): { inputTree: InputTree; errors: Error[] } {
  assert(tagIs(element, "math"));
  const errors: Error[] = [];
  const root = toMathLayout(element, errors);
  assert(!Array.isArray(root));
  assert(root instanceof InputRow);
  const inputTree = new InputTree(root);
  return { inputTree, errors };
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
    return [
      new InputNodeSymbol('"'),
      ...unicodeSplit(getText(element)).map((v) => new InputNodeSymbol(v)),
      new InputNodeSymbol('"'),
    ];
  } else if (tagIs(element, "mi", "mn")) {
    return unicodeSplit(getText(element)).map((v) => new InputNodeSymbol(v));
  } else if (tagIs(element, "mo")) {
    return unicodeSplit(getText(element)).map((v) => new InputNodeSymbol(v));
  } else if (tagIs(element, "mfrac")) {
    return (
      expectNChildren(element, 2, errors) ??
      InputNodeContainer.fraction(children.map((c) => wrapInRow(toMathLayout(c, errors))) as [InputRow, InputRow])
    );
  } else if (tagIs(element, "msqrt")) {
    return InputNodeContainer.root([
      wrapInRow(new InputNodeSymbol("2")),
      wrapInRow(children.flatMap((c) => toMathLayout(c, errors))),
    ]);
  } else if (tagIs(element, "mroot")) {
    return (
      expectNChildren(element, 2, errors) ??
      InputNodeContainer.root([wrapInRow(toMathLayout(children[1], errors)), wrapInRow(toMathLayout(children[0], errors))])
    );
  } else if (tagIs(element, "msub")) {
    let base = toMathLayout(children[0], errors);
    if (!Array.isArray(base)) {
      base = [base];
    }
    return (
      expectNChildren(element, 2, errors) ?? [...base, InputNodeContainer.sub(wrapInRow(toMathLayout(children[1], errors)))]
    );
  } else if (tagIs(element, "msup")) {
    let base = toMathLayout(children[0], errors);
    if (!Array.isArray(base)) {
      base = [base];
    }
    return (
      expectNChildren(element, 2, errors) ?? [...base, InputNodeContainer.sup(wrapInRow(toMathLayout(children[1], errors)))]
    );
  } else if (tagIs(element, "msubsup")) {
    let base = toMathLayout(children[0], errors);
    if (!Array.isArray(base)) {
      base = [base];
    }
    return (
      expectNChildren(element, 3, errors) ?? [
        ...base,
        InputNodeContainer.sub(wrapInRow(toMathLayout(children[1], errors))),
        InputNodeContainer.sup(wrapInRow(toMathLayout(children[2], errors))),
      ]
    );
  } else if (tagIs(element, "munder")) {
    return (
      expectNChildren(element, 2, errors) ??
      InputNodeContainer.under([wrapInRow(toMathLayout(children[0], errors)), wrapInRow(toMathLayout(children[1], errors))])
    );
  } else if (tagIs(element, "mover")) {
    return (
      expectNChildren(element, 2, errors) ??
      InputNodeContainer.over([wrapInRow(toMathLayout(children[0], errors)), wrapInRow(toMathLayout(children[1], errors))])
    );
  } else if (tagIs(element, "munderover")) {
    return (
      expectNChildren(element, 3, errors) ??
      InputNodeContainer.over([
        wrapInRow(
          InputNodeContainer.under([wrapInRow(toMathLayout(children[0], errors)), wrapInRow(toMathLayout(children[1], errors))])
        ),
        wrapInRow(toMathLayout(children[2], errors)),
      ])
    );
  } else if (tagIs(element, "mtable")) {
    if (!children.every((c) => tagIs(c, "mtr") && [...c.children].every((cc) => tagIs(cc, "mtd")))) {
      errors.push(new Error("Unexpected children " + element));
      return new InputNodeSymbol("Error");
    }

    const tableWidth = children.map((c) => c.children.length).reduce((a, b) => Math.max(a, b), 0);

    const tableCells = children.flatMap((c) =>
      Array.from({ length: tableWidth }, (_, i) =>
        i < c.children.length ? wrapInRow(toMathLayout(c.children[i], errors)) : new InputRow([])
      )
    );

    return InputNodeContainer.table(tableCells, tableWidth);
  } else if (tagIs(element, "mstyle")) {
    return [];
  } else {
    errors.push(new Error("Unknown element " + element.tagName));
    return new InputNodeSymbol("Error");
  }
}

function expectNChildren(element: Element, n: number, errors: Error[]): InputNodeSymbol | null {
  if (element.children.length != n) {
    errors.push(new Error(`Expected ${n} children in ${element.tagName.toLowerCase()}`));
    return new InputNodeSymbol("Error");
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
    return new InputRow([]);
  }

  if (!Array.isArray(mathLayout)) {
    if (mathLayout instanceof InputRow) {
      return mathLayout;
    }
    mathLayout = [mathLayout];
  }
  return new InputRow(
    mathLayout.flatMap((v) => {
      if (v instanceof InputRow) {
        return v.values;
      } else {
        return v;
      }
    })
  );
}
