import { NodeIdentifier, ParseResult, SyntaxNode } from "../core";
import { Offset } from "../math-layout/math-layout-offset";
import { RowIndices } from "../math-layout/math-layout-zipper";
import { ViewportCoordinate, ViewportRect, ViewportValue } from "./viewport-coordinate";

export interface Renderer<T> {
  canRender(syntaxTreeNames: NodeIdentifier): boolean;

  renderAll(parsed: ParseResult): RenderResult<T>;

  render(syntaxTree: SyntaxNode): RenderedElement<T>;
}

/**
 * Position of a caret on a row. `y` is the baseline of the row.
 * Height and depth are relative to the baseline of the row.
 */
export type RenderedPosition = { position: ViewportCoordinate; height: ViewportValue; depth: ViewportValue };
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
  getViewportPosition(layoutPosition: RowIndicesAndOffset): RenderedPosition;

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
  getViewportPosition(offset: Offset): RenderedPosition;

  /**
   * Gets the bounding box of the element.
   */
  getBounds(): ViewportRect;
}
