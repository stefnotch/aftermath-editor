import { SyntaxNode, getRowNode, hasSyntaxNodeChildren, joinNodeIdentifier } from "../core";
import { InputRowPosition } from "../input-position/input-row-position";
import { RowIndices } from "../input-tree/row-indices";
import { RenderResult, RowIndicesAndRange } from "../rendering/render-result";
import { assert } from "../utils/assert";
import { CaretDomElement } from "./caret-element";
import { CaretRange, moveCaret } from "./editing/math-layout-caret";

export class MathEditorCarets {
  #carets: Set<MathCaret> = new Set<MathCaret>();
  #pointerDownCarets: Map<number, MathCaret> = new Map<number, MathCaret>();
  #containerElement: HTMLElement;

  constructor() {
    this.#containerElement = document.createElement("div");
    this.#containerElement.style.position = "absolute";
  }

  get element() {
    return this.#containerElement;
  }

  add(layoutCaret: CaretRange) {
    // TODO: Always guarantee that carets are non-overlapping
    const newCaret = this.createCaret(layoutCaret);
    this.addAndMergeCarets(newCaret);
  }

  remove(caret: MathCaret) {
    caret.remove();
    this.#containerElement.removeChild(caret.element.element);
    this.#carets.delete(caret);
  }

  clearCarets() {
    this.#carets.forEach((caret) => {
      caret.remove();
    });
    this.#carets.clear();
    this.#pointerDownCarets.forEach((caret) => {
      caret.remove();
    });
    this.#pointerDownCarets.clear();
  }

  renderCarets(syntaxTree: SyntaxNode, renderResult: RenderResult<MathMLElement>) {
    this.map((caret) => caret.renderCaret(syntaxTree, renderResult));
  }

  addPointerDownCaret(pointerId: number, position: InputRowPosition) {
    this.#pointerDownCarets.set(pointerId, this.createCaret(new CaretRange(position)));
  }

  updatePointerDownCaret(pointerId: number, position: InputRowPosition) {
    const caret = this.#pointerDownCarets.get(pointerId);
    if (!caret) return;
    // TODO: Table selections
    caret.caret = CaretRange.getSharedCaret(caret.startPosition, position);
  }

  removePointerDownCaret(pointerId: number) {
    this.#pointerDownCarets.delete(pointerId);
  }

  finishPointerDownCaret(pointerId: number) {
    const caret = this.#pointerDownCarets.get(pointerId) ?? null;
    if (caret === null) return;
    this.#pointerDownCarets.delete(pointerId);
    this.addAndMergeCarets(caret);
  }

  serialize() {
    return this.map((v) => CaretRange.serialize(v.caret));
  }

  private map<T>(fn: (caret: MathCaret) => T): T[] {
    return Array.from(this.#carets).concat(Array.from(this.#pointerDownCarets.values())).map(fn);
  }

  private createCaret(caret: CaretRange, startPostion?: InputRowPosition) {
    return new MathCaret(this.#containerElement, {
      startPosition: startPostion ?? caret.range.startPosition(),
      caret,
      element: new CaretDomElement(),
    });
  }

  private addAndMergeCarets(newCaret: MathCaret) {
    this.#carets.add(newCaret);
  }
}

class MathCaret {
  /**
   * Where the user started the caret.
   */
  startPosition: InputRowPosition;
  /**
   * The current caret, which may be different from the start position if the user has selected a range.
   */
  caret: CaretRange;
  element: CaretDomElement;

  highlightedElements: ReadonlyArray<Element> = [];

  constructor(
    public container: HTMLElement,
    opts: { startPosition: InputRowPosition; caret: CaretRange; element: CaretDomElement }
  ) {
    this.startPosition = opts.startPosition;
    this.caret = opts.caret;
    this.element = opts.element;

    container.append(this.element.element);
  }

  renderCaret(syntaxTree: SyntaxNode, renderResult: RenderResult<MathMLElement>) {
    const caretIndices = RowIndices.fromZipper(this.caret.range.zipper);
    const renderedCaret = renderResult.getViewportSelection({
      indices: caretIndices,
      start: this.caret.leftOffset,
      end: this.caret.rightOffset,
    });
    // Render caret itself
    const caretSize = renderResult.getViewportCaretSize(caretIndices);
    this.element.setPosition(
      renderedCaret.rect.x + (this.caret.isForwards ? renderedCaret.rect.width : 0),
      renderedCaret.baseline + caretSize * 0.1
    );
    this.element.setHeight(caretSize);

    // Render selection
    this.element.clearSelections();
    if (!this.caret.isCollapsed) {
      this.element.addSelection(renderedCaret.rect);
    }

    // Highlight container (for the caret)
    const container = renderResult.getElement(caretIndices);
    this.setHighlightedElements(container.getElements());

    // Highlight token at the caret
    const tokenAtCaret = this.getTokenAtCaret(syntaxTree);
    this.element.setToken(renderResult.getViewportSelection(tokenAtCaret));
    // TODO: Use symbols for autocomplete
    const symbolsAtCaret = MathCaret.getSymbolsAt(syntaxTree, tokenAtCaret);
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
    const indices = RowIndices.fromZipper(this.caret.range.zipper);
    const caretOffset = this.caret.range.end;
    // Now we walked down the indices, so we should be at the row we want.
    const row = getRowNode(syntaxTree, indices);

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
        end: caretOffset,
      };
    } else if (hasSyntaxNodeChildren(row, "Leaf")) {
      return {
        indices,
        start: 0,
        end: caretOffset,
      };
    } else if (hasSyntaxNodeChildren(row, "NewRows")) {
      assert(row.range.start === caretOffset || row.range.end === caretOffset);
      return {
        indices,
        start: 0,
        end: caretOffset,
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

      if (hasSyntaxNodeChildren(node, "Leaf")) {
        const leaf = node.children.Leaf;
        return leaf.symbols.slice(
          Math.max(leaf.range.start, indicesAndRange.start),
          Math.min(leaf.range.end, indicesAndRange.end)
        );
      } else if (hasSyntaxNodeChildren(node, "Containers")) {
        return node.children.Containers.flatMap((v) => getLeaves(v));
      } else if (hasSyntaxNodeChildren(node, "NewRows")) {
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
