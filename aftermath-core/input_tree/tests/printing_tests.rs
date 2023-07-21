use input_tree::node::*;
use input_tree::row::*;

#[test]
fn test_printing() {
    let input = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]);

    assert_eq!(input.to_string(), r#"(row "a" (sub 1x1 (row "1")))"#);
}

#[test]
fn test_printing_nested_fractions() {
    let input = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::symbol("+"),
        InputNode::fraction([
            InputRow::new(vec![
                InputNode::symbol("1"),
                InputNode::symbol("+"),
                InputNode::symbol("2"),
            ]),
            InputRow::new(vec![InputNode::fraction([
                InputRow::new(vec![]),
                InputRow::new(vec![
                    InputNode::root([
                        InputRow::new(InputNode::symbols(vec!["3"])),
                        InputRow::new(InputNode::symbols(vec!["3"])),
                    ]),
                    InputNode::sup(InputRow::new(InputNode::symbols(vec!["1"]))),
                ]),
            ])]),
        ]),
    ]);

    assert_eq!(
        input.to_string(),
        r#"(row "a" "+" (frac 1x2 (row "1" "+" "2") (row (frac 1x2 (row) (row (root 2x1 (row "3") (row "3")) (sup 1x1 (row "1")))))))"#
    );
}
