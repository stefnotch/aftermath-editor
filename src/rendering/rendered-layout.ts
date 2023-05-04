import { Offset } from "../math-layout/math-layout-offset";
import { MathLayoutPosition } from "../math-layout/math-layout-position";
import { MathLayoutRowZipper, RowIndices } from "../math-layout/math-layout-zipper";
import { ViewportValue } from "./viewport-coordinate";

export type RenderedPosition = { x: ViewportValue; y: ViewportValue; height: ViewportValue };

export interface RenderedLayout<T> {
  rootZipper: MathLayoutRowZipper;
  parseResult: todo; // we need types for the MathParseResult. we'll use the slow serde json and https://github.com/1Password/typeshare

  /**
   *  For highlighting the element that contains the caret.
   * That is important, so that the user knows which row they're on!
   */
  getElement(indices: RowIndices): RenderedElement<T>;

  // TODO: https://github.com/stefnotch/aftermath-editor/issues/19

  /**
   * For getting the caret position (and the positions for the selections)
   */
  getViewportPosition(indices: RowIndices, offset: Offset): RenderedPosition;

  /**
   * For clicking somewhere in the viewport and getting the caret position
   */
  getLayoutPosition(position: { x: ViewportValue; y: ViewportValue }): MathLayoutPosition;
}

/**
 * A virtual DOM element
 */
export interface RenderedElement<T> {
  /**
   * The actual underlying DOM nodes
   */
  getElements(): T[];

  addChild(child: RenderedElement<T>): void;

  getChildren(): RenderedElement<T>[];
}

/*
pub fn render<'row, 'semantic>(input: &'row Row, semantic: &'semantic ParseResult<MathSemantic>) -> DomElement {
    // TODO: Stuff
}
*/
