import { NodeIdentifier, ParseResult, SyntaxNode } from "../core";
import { Offset } from "../math-layout/math-layout-offset";
import { RowIndex, RowIndices } from "../math-layout/math-layout-zipper";
import { ViewportCoordinate, ViewportRect, ViewportValue } from "./viewport-coordinate";

export interface Renderer<T> {
  canRender(syntaxTreeNames: NodeIdentifier): boolean;

  renderAll(parsed: ParseResult): RenderResult<T>;

  render(syntaxTree: SyntaxNode, rowIndex: RowIndex | null): RenderedElement<T>;
}

/**
 * Position of a caret on a row. `y` is the baseline of the row.
 * Height and depth are relative to the baseline of the row.
 */
export class RenderedCaret {
  /**
   * Positive, and relative to the baseline of the row.
   */
  private height: ViewportValue;
  /**
   * Positive, and relative to the baseline of the row.
   */
  private depth: ViewportValue;
  private baselinePosition: ViewportCoordinate;
  constructor(baselinePosition: ViewportCoordinate, caretHeight: ViewportValue) {
    this.baselinePosition = baselinePosition;
    this.height = caretHeight * 0.9;
    this.depth = caretHeight * 0.1;
  }

  get bottomPosition(): ViewportCoordinate {
    const { x, y } = this.baselinePosition;
    return { x, y: y + this.depth };
  }

  get caretHeight(): ViewportValue {
    return this.height + this.depth;
  }
}
export type RowIndicesAndOffset = { indices: RowIndices; offset: Offset };
export interface RenderResult<T> {
  /**
   *  For highlighting the element that contains the caret.
   * That is important, so that the user knows which row they're on!
   */
  getElement(indices: RowIndices): RenderedElement<T>;

  // TODO: https://github.com/stefnotch/aftermath-editor/issues/19

  /**
   * For getting the caret position (and the positions for the selections)
   */
  getViewportPosition(layoutPosition: RowIndicesAndOffset): RenderedCaret;

  /**
   * For clicking somewhere in the viewport and getting the caret position.
   *
   * Note: There's a more complicated, optimized variant where we use extra info from the DOM.
   * See code before commit https://github.com/stefnotch/aftermath-editor/commit/502261f54deccc75778b0233247cf61c6c9bdf98 with "getAncestorIndicesFromDom"
   */
  getLayoutPosition(position: ViewportCoordinate): RowIndicesAndOffset;
}

/**
 * A virtual DOM element.
 * Every container element in the syntax tree has to be rendered, and has exactly one RenderedElement<T> associated with it.
 *
 * The containers are responsible for rendering their children.
 */
export interface RenderedElement<T> {
  /**
   * It's easier to walk down the render results if they know their syntax tree element.
   */
  syntaxTree: SyntaxNode;

  rowIndex: RowIndex | null;

  /**
   * The actual underlying DOM nodes
   */
  getElements(): ReadonlyArray<T>;

  /**
   * The children of this element, *excluding the leaf nodes*.
   */
  getChildren(): ReadonlyArray<RenderedElement<T>>;

  /**
   * @param offset The offset in the input tree row.
   */
  getViewportPosition(offset: Offset): RenderedCaret;

  /**
   * Gets the bounding box of the element.
   */
  getBounds(): ViewportRect;
}
