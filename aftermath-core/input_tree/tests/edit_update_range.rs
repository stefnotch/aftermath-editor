use input_tree::editing::editable::Editable;
use input_tree::editing::*;
use input_tree::focus::*;
use input_tree::node::*;
use input_tree::row::*;

#[test]
fn insert_expand_cursor() {
    let mut input = InputRow::new(vec![]);
    let insert_edit = BasicRowEdit::Insert {
        position: InputRowPosition::new(InputFocusRow::from_root(&input), Offset(0)).to_minimal(),
        values: vec![InputNode::symbol("b")],
    };

    let cursor: InputRowRange<'_> =
        (&InputRowPosition::new(InputFocusRow::from_root(&input), Offset(0))).into();
    let mut serialized_cursor = cursor.to_minimal();
    input.apply_edit(&insert_edit);
    serialized_cursor.apply_edit(&insert_edit);

    let cursor = InputRowRange::from_minimal(InputFocusRow::from_root(&input), &serialized_cursor);
    assert_eq!(cursor.start, Offset(0));
    assert_eq!(cursor.end, Offset(1));
    assert_eq!(cursor.row_indices(), &RowIndices::new(vec![]));
}

#[test]
fn remove_shrink_cursor_range() {
    let mut input = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::symbol("-"),
        InputNode::symbol("-"),
        InputNode::symbol("1"),
    ]);
    let remove_edit = BasicRowEdit::Delete {
        position: InputRowPosition::new(InputFocusRow::from_root(&input), Offset(0)).to_minimal(),
        values: vec![
            InputNode::symbol("a"),
            InputNode::symbol("-"),
            InputNode::symbol("-"),
        ],
    };

    let cursor: InputRowRange<'_> =
        InputRowRange::new(InputFocusRow::from_root(&input), Offset(1), Offset(4));
    let mut serialized_cursor = cursor.to_minimal();
    input.apply_edit(&remove_edit);
    serialized_cursor.apply_edit(&remove_edit);

    let cursor = InputRowRange::from_minimal(InputFocusRow::from_root(&input), &serialized_cursor);
    assert_eq!(cursor.start, Offset(0));
    assert_eq!(cursor.end, Offset(1));
    assert_eq!(cursor.row_indices(), &RowIndices::new(vec![]));
}
