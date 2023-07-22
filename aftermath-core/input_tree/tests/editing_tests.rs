use input_tree::editing::editable::Editable;
use input_tree::editing::invertible::Invertible;
use input_tree::editing::*;
use input_tree::focus::*;
use input_tree::node::*;
use input_tree::row::*;

#[test]
fn insert_into_empty() {
    let mut input = InputRow::new(vec![]);
    let insert_edit = BasicEdit::Insert {
        position: InputRowPosition::new(InputFocusRow::from_root(&input), Offset(0)).to_minimal(),
        values: vec![InputNode::symbol("b")],
    };
    input.apply_edit(&insert_edit);
    let expected = InputRow::new(vec![InputNode::symbol("b")]);
    assert_eq!(input, expected);
}

#[test]
fn insert_into_non_empty() {
    let mut input = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]);
    let insert_edit = BasicEdit::Insert {
        position: InputRowPosition::new(InputFocusRow::from_root(&input), Offset(1)).to_minimal(),
        values: vec![InputNode::symbol("x")],
    };
    input.apply_edit(&insert_edit);
    let expected = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::symbol("x"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]);
    assert_eq!(input, expected);
}

#[test]
fn delete_nested() {
    let mut input = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![
            InputNode::symbol("-"),
            InputNode::symbol("-"),
            InputNode::symbol("1"),
        ])),
    ]);

    let delete_edit = BasicEdit::Delete {
        position: InputRowPosition::new(
            InputFocusRow::from_root(&input)
                .child_at(1)
                .unwrap()
                .child_at(0)
                .unwrap(),
            Offset(0),
        )
        .to_minimal(),
        values: vec![InputNode::symbol("-"), InputNode::symbol("-")],
    };
    input.apply_edit(&delete_edit);
    let expected = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]);
    assert_eq!(input, expected);
}

#[test]
fn invert_edit() {
    let mut input = InputRow::new(vec![InputNode::symbol("a")]);
    let insert_edit = BasicEdit::Insert {
        position: InputRowPosition::new(InputFocusRow::from_root(&input), Offset(1)).to_minimal(),
        values: vec![InputNode::fraction([
            InputRow::new(vec![InputNode::symbol("b")]),
            InputRow::new(vec![InputNode::symbol("c")]),
        ])],
    };
    input.apply_edit(&insert_edit);
    let expected = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::fraction([
            InputRow::new(vec![InputNode::symbol("b")]),
            InputRow::new(vec![InputNode::symbol("c")]),
        ]),
    ]);
    assert_eq!(input, expected);
    input.apply_edit(&insert_edit.inverse());
    assert_eq!(input, InputRow::new(vec![InputNode::symbol("a")]));
}
