import { Offset } from "../math-layout/math-layout-offset";
import { MathLayoutPosition } from "../math-layout/math-layout-position";
import { MathLayoutRowZipper, RowIndices } from "../math-layout/math-layout-zipper";
import { ViewportValue } from "./viewport-coordinate";

export type RenderedPosition = { x: ViewportValue; y: ViewportValue; height: ViewportValue };

export interface RenderedLayout {
  rootZipper: MathLayoutRowZipper;
  semantics: todo;

  /**
   *  For highlighting the element that contains the caret.
   * That is important, so that the user knows which row they're on!
   */
  getElement(indices: RowIndices): Element;

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

/*
pub fn render<'row, 'semantic>(input: &'row Row, semantic: &'semantic ParseResult<MathSemantic>) -> DomElement {
    // TODO: Stuff
}
*/
