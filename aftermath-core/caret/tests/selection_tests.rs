use caret::caret::{Caret, CaretSelection};
use input_tree::{
    focus::InputRowPosition, grid::Offset2D, input_row, input_tree::InputTree, row::Offset,
};

#[test]
fn test_basic_selection() {
    let input = InputTree::new(input_row!(
      (row (fraction (row "a"), (row "b")), "+", "c")
    ));

    let start = InputRowPosition::new(input.root_focus(), Offset(0));
    let end = InputRowPosition::new(input.root_focus(), Offset(2));
    let caret = Caret::new(&input, start, end);

    match caret.selection() {
        CaretSelection::Row(range) => {
            assert_eq!(range.row_indices().len(), 0);
            assert_eq!(range.left_offset(), Offset(0));
            assert_eq!(range.right_offset(), Offset(2));
        }
        CaretSelection::Grid(_) => panic!("Expected row selection"),
    }
}

#[test]
fn test_full_grid_selection() {
    let input = InputTree::new(input_row!(
      (row (table 2 x 2 (row "a", "b"), (row "b"), (row "c"), (row "d")))
    ));

    let start = InputRowPosition::new(
        input.root_focus().child_at(0).unwrap().child_at(0).unwrap(),
        Offset(1),
    );
    let end = InputRowPosition::new(
        input.root_focus().child_at(0).unwrap().child_at(3).unwrap(),
        Offset(0),
    );
    let caret = Caret::new(&input, start, end);

    match caret.selection() {
        CaretSelection::Row(_) => panic!("Expected grid selection"),
        CaretSelection::Grid(selection) => {
            assert_eq!(
                selection.top_left_index(),
                Offset2D {
                    x: Offset(0),
                    y: Offset(0),
                }
            );
            assert_eq!(
                selection.bottom_right_index(),
                Offset2D {
                    x: Offset(2),
                    y: Offset(2),
                }
            );
        }
    }
}
