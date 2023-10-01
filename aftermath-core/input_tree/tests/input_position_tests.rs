use input_tree::focus::*;
use input_tree::input_row;
use input_tree::node::*;
use input_tree::row::*;

#[test]
fn test_positions_ordered() {
    let input = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]);

    let position_start = InputRowPosition::new(InputFocusRow::from_root(&input), Offset(0));
    let position_middle = InputRowPosition::new(InputFocusRow::from_root(&input), Offset(1));
    let position_end = InputRowPosition::new(InputFocusRow::from_root(&input), Offset(2));
    let position_end_again = InputRowPosition::new(InputFocusRow::from_root(&input), Offset(2));

    assert!(position_start < position_middle);
    assert!(position_middle < position_end);
    assert!(position_end == position_end_again);
}

#[test]
fn test_positions_nested_ordered() {
    let input = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]);

    let position_middle = InputRowPosition::new(InputFocusRow::from_root(&input), Offset(1));
    let position_inside = InputRowPosition::new(
        InputFocusRow::from_root(&input)
            .child_at(1)
            .unwrap()
            .child_at(0)
            .unwrap(),
        Offset(0),
    );
    let position_end = InputRowPosition::new(InputFocusRow::from_root(&input), Offset(2));

    assert!(position_middle < position_inside);
    assert!(position_inside > position_middle);
    assert!(position_inside < position_end);
}

#[test]
fn test_positions_in_fractions_ordered() {
    let input = input_row! {
      (row
        (fraction (row "a"), (row "b")),
        "+",
        (fraction (row "c"), (row "d")),
      )
    };

    let start = InputRowPosition::new(
        InputFocusRow::from_root(&input).row_at((0, 0)).unwrap(),
        Offset(1),
    );
    let end = InputRowPosition::new(
        InputFocusRow::from_root(&input).row_at((2, 1)).unwrap(),
        Offset(0),
    );

    assert!(start < end);
    assert!(start <= end);
}
