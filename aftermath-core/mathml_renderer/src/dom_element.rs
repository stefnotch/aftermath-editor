#[derive(Serialize)]
// TODO: Turn this into an interface and do it in Typescript!
// Since lots of the methods can really only be implemented using JS

// TODO:
// For highlighting the element that contains the caret. That is important, so that you know which row you're on!
// - getCaretContainer(mathLayout: MathLayoutRowZipper): Element
// + getElement(indices: RowIndices): Element
//
// TODO: https://github.com/stefnotch/aftermath-editor/issues/19
// 
// For getting the caret position (and the positions for the selections)
// - layoutToViewportPosition(layoutPosition: MathLayoutPosition) {x,y,height} - Given a position in the layout, get the correct viewport position
// + getViewportPosition(indices: RowIndices, offset: usize) {x,y,height}
//
// For clicking somewhere in the viewport and getting the caret position
// - viewportToLayoutPosition(position: { x: ViewportValue; y: ViewportValue },   
//  rootZipper: MathLayoutRowZipper) : MathLayoutPosition - Given a viewport position, find the closest offset in the row
// + getLayoutPosition(position: { x: ViewportValue; y: ViewportValue }) : (RowIndices, Offset usize)
//
// TODO: Contain enough info to directly create the MathML DOM!
   
pub enum DomElement {

}