import { ParseResult, SyntaxTree } from "../core";
import { Offset } from "../math-layout/math-layout-offset";
import { MathLayoutPosition } from "../math-layout/math-layout-position";
import { RowIndices } from "../math-layout/math-layout-zipper";
import { ViewportCoordinate, ViewportValue } from "./viewport-coordinate";

export interface Renderer<T> {
  canRender(syntaxTreeNames: string[]): boolean;

  render(parsed: ParseResult): RenderResult<T>;
}

/**
 * Position of a caret on a row. `y` is the baseline of the row.
 * Height and depth are relative to the baseline of the row.
 */
export type RenderedPosition = { position: ViewportCoordinate; height: ViewportValue; depth: ViewportValue };
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
  getViewportPosition(layoutPosition: MathLayoutPosition): RenderedPosition;

  /**
   * For clicking somewhere in the viewport and getting the caret position
   */
  getLayoutPosition(position: ViewportCoordinate): MathLayoutPosition;
}

/**
 * A virtual DOM element.
 * Every element in the syntax tree has to be rendered, and has exactly one RenderedElement<T> associated with it.
 */
export interface RenderedElement<T> {
  getViewportPosition(offset: Offset): RenderedPosition;
  /**
   * It's easier to walk down the render results if they know their syntax tree element.
   */
  syntaxTree: SyntaxTree;

  /**
   * The actual underlying DOM nodes
   */
  getElements(): T[];

  setChildren(children: RenderedElement<T>[]): void;

  getChildren(): RenderedElement<T>[];
}
