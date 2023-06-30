import type { NodeIdentifier, ParseResult, SyntaxNode } from "../core";
import type { Offset } from "../input-tree/input-offset";
import { type RowIndex, RowIndices } from "../input-tree/row-indices";
import { RenderedSelection } from "./rendered-selection";
import type { ViewportCoordinate, ViewportRect, ViewportValue } from "./viewport-coordinate";

export interface Renderer<T> {
  canRender(syntaxTreeNames: NodeIdentifier): boolean;

  renderAll(parsed: ParseResult): RenderResult<T>;

  render(syntaxTree: SyntaxNode, rowIndex: RowIndex | null): RenderedElement<T>;
}

export type RowIndicesAndOffset = { indices: RowIndices; offset: Offset };
export type RowIndicesAndRange = { indices: RowIndices; start: Offset; end: Offset };
export interface RenderResult<T> {
  /**
   *  For highlighting the element that contains the caret.
   * That is important, so that the user knows which row they're on!
   */
  getElement(indices: RowIndices): RenderedElement<T>;

  /**
   * For getting the position to render a given selection.
   */
  getViewportSelection(selection: RowIndicesAndRange): RenderedSelection;

  /**
   * For getting the position to render a given row selection.
   * This can be used for highlighting a table cell.
   */
  getViewportRowSelection(row: RowIndices): ViewportRect;

  /**
   * For getting the caret size at a specific position.
   */
  getViewportCaretSize(row: RowIndices): ViewportValue;

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
   * @returns The position of the baseline.
   */
  getCaretPosition(offset: Offset): ViewportCoordinate;

  /**
   * For getting the caret size at a specific position.
   */
  getCaretSize(): ViewportValue;

  /**
   * Gets the full bounding box of the element.
   */
  getBounds(): ViewportRect;
}
