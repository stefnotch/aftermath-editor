import { SyntaxNode, getRowNode, hasSyntaxNodeChildren, joinNodeIdentifier } from "../core";
import { Offset } from "../math-layout/math-layout-offset";
import { MathLayoutPosition } from "../math-layout/math-layout-position";
import { MathLayoutRowZipper, getRowIndices } from "../math-layout/math-layout-zipper";
import { RenderResult, RowIndicesAndRange } from "../rendering/render-result";
import { assert } from "../utils/assert";
import { CaretElement } from "./caret-element";
import { MathLayoutCaret, moveCaret } from "./editing/math-layout-caret";

export class MathCaret {
  /**
   * Where the user started the caret.
   */
  startPosition: MathLayoutPosition;
  /**
   * The current caret, which may be different from the start position if the user has selected a range.
   */
  caret: MathLayoutCaret;
  element: CaretElement;

  highlightedElements: ReadonlyArray<Element> = [];

  constructor(
    public container: HTMLElement,
    opts: { startPosition: MathLayoutPosition; caret: MathLayoutCaret; element: CaretElement }
  ) {
    this.startPosition = opts.startPosition;
    this.caret = opts.caret;
    this.element = opts.element;

    container.append(this.element.element);
  }

  /**
   * Note: Make sure to re-render the caret after moving it
   */
  moveCaret(renderResult: RenderResult<MathMLElement>, direction: "up" | "down" | "left" | "right") {
    const newCaret = moveCaret(this.caret, direction, renderResult);
    if (newCaret) {
      this.caret = newCaret;
    }
  }

  /**
   * Get the token to the left of the caret. Can also return a partial token if the caret is in the middle of a token.
   * TODO: Return an array with all tokens that the caret is to the left of.
   * For example x1 is parsed roughly as (Error (Identifier x) (Number 1)). If the caret is at the end of x1|, then we should
   * be able to show autocomplete suggestions for both (Number 1) and (Error ...).
   * The error would show the "did you mean x_1" autocomplete suggestion.
   */
  getTokenAtCaret(syntaxTree: SyntaxNode): RowIndicesAndRange {
    const indices = getRowIndices(this.caret.zipper);
    // Now we walked down the indices, so we should be at the row we want.
    const row = getRowNode(syntaxTree, indices);
    const caretOffset = this.caret.end;

    if (hasSyntaxNodeChildren(row, "Containers")) {
      // The row has further children, so we gotta inspect those.
      let node: SyntaxNode = row;
      while (true) {
        if (!hasSyntaxNodeChildren(node, "Containers")) break;
        // Caret inside or to the left of the child
        let newNode = node.children.Containers.find(
          (child) => child.range.start < caretOffset && caretOffset <= child.range.end
        );
        if (newNode) {
          node = newNode;
        } else {
          break;
        }
      }
      return {
        indices,
        start: node.range.start,
        end: this.caret.end,
      };
    } else if (hasSyntaxNodeChildren(row, "Leaves")) {
      return {
        indices,
        start: 0,
        end: this.caret.end,
      };
    } else if (hasSyntaxNodeChildren(row, "NewTable") || hasSyntaxNodeChildren(row, "NewRows")) {
      assert(row.range.start === this.caret.end || row.range.end === this.caret.end);
      return {
        indices,
        start: 0,
        end: this.caret.end,
      };
    } else {
      throw new Error("Unexpected row type " + joinNodeIdentifier(row.name));
    }
  }

  static getSymbolsAt(syntaxTree: SyntaxNode, indicesAndRange: RowIndicesAndRange): string[] {
    const node = getRowNode(syntaxTree, indicesAndRange.indices);

    function getLeaves(node: SyntaxNode): string[] {
      const isDisjoint = node.range.end <= indicesAndRange.start || indicesAndRange.end <= node.range.start;
      if (isDisjoint) return [];

      if (hasSyntaxNodeChildren(node, "Leaves")) {
        let symbols: string[] = [];
        for (const leaf of node.children.Leaves) {
          symbols = symbols.concat(
            leaf.symbols.slice(Math.max(leaf.range.start, indicesAndRange.start), Math.min(leaf.range.end, indicesAndRange.end))
          );
        }
        return symbols;
      } else if (hasSyntaxNodeChildren(node, "Containers")) {
        return node.children.Containers.flatMap((v) => getLeaves(v));
      } else if (hasSyntaxNodeChildren(node, "NewTable") || hasSyntaxNodeChildren(node, "NewRows")) {
        // Maybe return some dummy symbols here?
        return [];
      } else {
        throw new Error("Unexpected row type " + joinNodeIdentifier(node.name));
      }
    }

    return getLeaves(node);
  }

  setHighlightedElements(elements: ReadonlyArray<Element>) {
    this.highlightedElements.forEach((v) => v.classList.remove("caret-container-highlight"));
    this.highlightedElements = elements;
    this.highlightedElements.forEach((v) => v.classList.add("caret-container-highlight"));
  }

  remove() {
    this.container.removeChild(this.element.element);
    this.setHighlightedElements([]);
  }
}

export class MathEditorCarets {
  carets: Set<MathCaret> = new Set<MathCaret>();
  pointerDownCarets: Map<number, MathCaret> = new Map<number, MathCaret>();
  #containerElement: HTMLElement;

  constructor() {
    this.#containerElement = document.createElement("div");
    this.#containerElement.style.position = "absolute";
  }

  get element() {
    return this.#containerElement;
  }

  add(layoutCaret: MathLayoutCaret) {
    // TODO: Always guarantee that carets are non-overlapping
    this.carets.add(this.createCaret(layoutCaret.zipper, layoutCaret.start, layoutCaret.end));
  }

  remove(caret: MathCaret) {
    caret.remove();
    this.#containerElement.removeChild(caret.element.element);
    this.carets.delete(caret);
  }

  clearCarets() {
    this.carets.forEach((caret) => {
      caret.remove();
    });
    this.carets.clear();
    this.pointerDownCarets.forEach((caret) => {
      caret.remove();
    });
    this.pointerDownCarets.clear();
  }

  updateCaret(caret: MathCaret, newCaret: MathLayoutCaret | null) {
    if (newCaret) {
      caret.caret = newCaret;
    }
  }

  addPointerDownCaret(pointerId: number, zipper: MathLayoutRowZipper, offset: number) {
    this.pointerDownCarets.set(pointerId, this.createCaret(zipper, offset, offset));
  }

  removePointerDownCaret(pointerId: number) {
    this.pointerDownCarets.delete(pointerId);
  }

  finishPointerDownCaret(pointerId: number) {
    const caret = this.pointerDownCarets.get(pointerId) ?? null;
    if (caret === null) return;
    this.pointerDownCarets.delete(pointerId);
    this.carets.add(caret);
  }

  map<T>(fn: (caret: MathCaret) => T): T[] {
    return Array.from(this.carets).concat(Array.from(this.pointerDownCarets.values())).map(fn);
  }

  private createCaret(zipper: MathLayoutRowZipper, startOffset: Offset, endOffset: Offset) {
    return new MathCaret(this.#containerElement, {
      startPosition: new MathLayoutPosition(zipper, startOffset),
      caret: new MathLayoutCaret(zipper, startOffset, endOffset),
      element: new CaretElement(),
    });
  }
}
