use input_tree::editing::editable::Editable;
use input_tree::editing::*;
use input_tree::focus::*;
use input_tree::input_tree::InputTree;
use input_tree::node::*;
use input_tree::row::*;

#[test]
fn insert_expand_cursor() {
    let mut input = InputTree::new(InputRow::new(vec![]));
    let insert_edit = RowEdit {
        edit_type: EditType::Insert,
        position: InputRowPosition::new(input.root_focus(), Offset(0)).to_minimal(),
        values: vec![InputNode::symbol("b")],
    }
    .into();

    let cursor: InputRowRange<'_> = (&InputRowPosition::new(input.root_focus(), Offset(0))).into();
    let mut serialized_cursor = cursor.to_minimal();
    input.apply_edit(&insert_edit);
    serialized_cursor.apply_edit(&insert_edit);

    let cursor = InputRowRange::from_minimal(input.root_focus(), &serialized_cursor);
    assert_eq!(cursor.start, Offset(0));
    assert_eq!(cursor.end, Offset(1));
    assert_eq!(cursor.row_indices(), &RowIndices::new(vec![]));
}

#[test]
fn remove_shrink_cursor_range() {
    let mut input = InputTree::new(InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::symbol("-"),
        InputNode::symbol("-"),
        InputNode::symbol("1"),
    ]));
    let remove_edit = RowEdit {
        edit_type: EditType::Delete,
        position: InputRowPosition::new(input.root_focus(), Offset(0)).to_minimal(),
        values: vec![
            InputNode::symbol("a"),
            InputNode::symbol("-"),
            InputNode::symbol("-"),
        ],
    }
    .into();

    let cursor: InputRowRange<'_> = InputRowRange::new(input.root_focus(), Offset(1), Offset(4));
    let mut serialized_cursor = cursor.to_minimal();
    input.apply_edit(&remove_edit);
    serialized_cursor.apply_edit(&remove_edit);

    let cursor = InputRowRange::from_minimal(input.root_focus(), &serialized_cursor);
    assert_eq!(cursor.start, Offset(0));
    assert_eq!(cursor.end, Offset(1));
    assert_eq!(cursor.row_indices(), &RowIndices::new(vec![]));
}
