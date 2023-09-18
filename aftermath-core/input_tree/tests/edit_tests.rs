use input_tree::editing::editable::Editable;
use input_tree::editing::invertible::Invertible;
use input_tree::editing::*;
use input_tree::focus::*;
use input_tree::grid::GridDirection;
use input_tree::grid::GridVec;
use input_tree::input_row;
use input_tree::input_tree::InputTree;
use input_tree::node::*;
use input_tree::row::*;

#[test]
fn insert_into_empty() {
    let mut input = InputTree::new(InputRow::new(vec![]));
    let insert_edit = RowEdit {
        edit_type: EditType::Insert,
        position: InputRowPosition::new(input.root_focus(), Offset(0)).to_minimal(),
        values: vec![InputNode::symbol("b")],
    };
    input.apply_edit(&insert_edit.into());
    let expected = InputRow::new(vec![InputNode::symbol("b")]);
    assert_eq!(input.root, expected);
}

#[test]
fn insert_into_non_empty() {
    let mut input = InputTree::new(InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]));
    let insert_edit = RowEdit {
        edit_type: EditType::Insert,
        position: InputRowPosition::new(input.root_focus(), Offset(1)).to_minimal(),
        values: vec![InputNode::symbol("x")],
    };
    input.apply_edit(&insert_edit.into());
    let expected = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::symbol("x"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]);
    assert_eq!(input.root, expected);
}

#[test]
fn delete_nested() {
    let mut input = InputTree::new(InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![
            InputNode::symbol("-"),
            InputNode::symbol("-"),
            InputNode::symbol("1"),
        ])),
    ]));

    let delete_edit = RowEdit {
        edit_type: EditType::Delete,
        position: InputRowPosition::new(
            input.root_focus().child_at(1).unwrap().child_at(0).unwrap(),
            Offset(0),
        )
        .to_minimal(),
        values: vec![InputNode::symbol("-"), InputNode::symbol("-")],
    };
    input.apply_edit(&delete_edit.into());
    let expected = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]);
    assert_eq!(input.root, expected);
}

#[test]
fn invert_edit() {
    let mut input = InputTree::new(InputRow::new(vec![InputNode::symbol("a")]));
    let insert_edit = RowEdit {
        edit_type: EditType::Insert,
        position: InputRowPosition::new(input.root_focus(), Offset(1)).to_minimal(),
        values: vec![InputNode::fraction([
            InputRow::new(vec![InputNode::symbol("b")]),
            InputRow::new(vec![InputNode::symbol("c")]),
        ])],
    }
    .into();
    input.apply_edit(&insert_edit);
    let expected = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::fraction([
            InputRow::new(vec![InputNode::symbol("b")]),
            InputRow::new(vec![InputNode::symbol("c")]),
        ]),
    ]);
    assert_eq!(input.root, expected);
    input.apply_edit(&insert_edit.inverse());
    assert_eq!(input.root, InputRow::new(vec![InputNode::symbol("a")]));
}

#[test]
fn insert_grid_row() {
    let mut input = InputTree::new(input_row! {
        (row
            (root (row "2"), (row (table 3 x 2
                (row "a"), (row "b"), (row "c"),
                (row "d"), (row "e"), (row "f")
            )))
        )
    });
    let row_insert = GridEdit {
        edit_type: EditType::Insert,
        element_indices: input
            .root_focus()
            .child_at(0)
            .unwrap()
            .child_at(1)
            .unwrap()
            .child_at(0)
            .unwrap()
            .element_indices()
            .clone(),
        direction: GridDirection::Row,
        row_or_column: Offset(1),
        values: GridVec::from_one_dimensional(
            vec![
                input_row! {(row "x")},
                input_row! {(row "y")},
                input_row! {(row "z")},
            ],
            3,
        ),
    };
    input.apply_edit(&row_insert.into());
    assert_eq!(
        input.root,
        input_row! {
            (row
                (root (row "2"), (row (table 3 x 3
                    (row "a"), (row "b"), (row "c"),
                    (row "x"), (row "y"), (row "z"),
                    (row "d"), (row "e"), (row "f")
                )))
            )
        }
    );
}

#[test]
fn insert_grid_colum() {
    let mut input = InputTree::new(input_row! {
        (row (table 1 x 1 (row "a")))
    });
    let column_insert = GridEdit {
        edit_type: EditType::Insert,
        element_indices: input
            .root_focus()
            .child_at(0)
            .unwrap()
            .element_indices()
            .clone(),
        direction: GridDirection::Column,
        row_or_column: Offset(1),
        values: GridVec::from_one_dimensional(vec![input_row! {(row "x")}], 1),
    };
    input.apply_edit(&column_insert.into());
    assert_eq!(
        input.root,
        input_row! {
            (row (table 2 x 1 (row "a"), (row "x")))
        }
    );
}
