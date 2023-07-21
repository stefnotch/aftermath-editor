use input_tree::input_focus::*;
use input_tree::node::*;
use input_tree::row::*;

#[test]
fn test_focus_zero() {
    let input = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]);

    let focus = InputFocusRow::from_root(&input);

    assert_eq!(focus.len(), 2);
    assert_eq!(focus.row_indices(), &RowIndices::default());
    assert_eq!(focus.child_at(1).unwrap().child_at(0).unwrap().len(), 1);
}

#[test]
fn test_focus_node() {
    let input = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]);

    let focus = InputFocusRow::from_root(&input).child_at(1).unwrap();

    match focus.node() {
        InputNode::Container(InputNodeVariant::Sub, _) => {}
        _ => panic!("Expected sub node"),
    }
}
