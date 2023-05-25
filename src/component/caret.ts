import { SyntaxNode, getRowNode, hasSyntaxNodeChildren, joinNodeIdentifier } from "../core";
import { Offset } from "../math-layout/math-layout-offset";
import { MathLayoutPosition } from "../math-layout/math-layout-position";
import { MathLayoutRowZipper, getRowIndices } from "../math-layout/math-layout-zipper";
import { RenderResult, RowIndicesAndRange } from "../rendering/render-result";
import { assert } from "../utils/assert";
import { CaretElement, createCaret } from "./caret-element";
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

  constructor(opts: { startPosition: MathLayoutPosition; caret: MathLayoutCaret; element: CaretElement }) {
    this.startPosition = opts.startPosition;
    this.caret = opts.caret;
    this.element = opts.element;
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
}

export class MathEditorCarets {
  carets: Set<MathCaret> = new Set<MathCaret>();
  pointerDownCarets: Map<number, MathCaret> = new Map<number, MathCaret>();

  constructor(private containerElement: HTMLElement) {}

  add(layoutCaret: MathLayoutCaret) {
    this.carets.add(this.createCaret(layoutCaret.zipper, layoutCaret.start, layoutCaret.end));
  }

  remove(caret: MathCaret) {
    caret.element.remove();
    this.carets.delete(caret);
  }

  clearCarets() {
    this.carets.forEach((caret) => {
      caret.element.remove();
    });
    this.carets.clear();
    this.pointerDownCarets.forEach((caret) => {
      caret.element.remove();
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
    return new MathCaret({
      startPosition: new MathLayoutPosition(zipper, startOffset),
      caret: new MathLayoutCaret(zipper, startOffset, endOffset),
      element: createCaret(this.containerElement),
    });
  }
}
