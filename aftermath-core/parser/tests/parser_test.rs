use input_tree::{input_node::InputNode, row::InputRow};
use parser::{parse_row, parse_rules::ParserRules};

#[test]
fn test_parser() {
    let layout = InputRow::new(vec![
        InputNode::Symbol("-".to_string()),
        InputNode::Symbol("b".to_string()),
        InputNode::Symbol("*".to_string()),
        InputNode::Symbol("C".to_string()),
    ]);
    let context = ParserRules::default();
    let parsed = parse_row(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        r#"(Arithmetic::Multiply (Arithmetic::Subtract (BuiltIn::Operator "-") (Core::Variable "b")) (BuiltIn::Operator "*") (Core::Variable "C"))"#
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_postfix() {
    let layout = InputRow::new(vec![
        InputNode::Symbol("c".to_string()),
        InputNode::Symbol("+".to_string()),
        InputNode::Symbol("a".to_string()),
        InputNode::Symbol("!".to_string()),
    ]);
    let context = ParserRules::default();
    let parsed = parse_row(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        r#"(Arithmetic::Add (Core::Variable "c") (BuiltIn::Operator "+") (Unsorted::Factorial (Core::Variable "a") (BuiltIn::Operator "!")))"#
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_sub() {
    let layout = InputRow::new(vec![
        InputNode::Symbol("a".to_string()),
        InputNode::Sub(InputRow::new(vec![InputNode::Symbol("1".to_string())])),
    ]);
    let context = ParserRules::default();
    let parsed = parse_row(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        r#"(BuiltIn::Sub (Core::Variable "a") (BuiltIn::Row (Arithmetic::Number "1")))"#
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_sup_sub() {
    let layout = InputRow::new(vec![
        InputNode::Symbol("a".to_string()),
        InputNode::Sup(InputRow::new(vec![InputNode::Symbol("1".to_string())])),
        InputNode::Sub(InputRow::new(vec![InputNode::Symbol("2".to_string())])),
    ]);
    let context = ParserRules::default();
    let parsed = parse_row(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        format!(
            "{}{}{}",
            r#"(BuiltIn::Sub "#,
            r#"(BuiltIn::Sup (Core::Variable "a") (BuiltIn::Row (Arithmetic::Number "1")))"#,
            r#" (BuiltIn::Row (Arithmetic::Number "2")))"#
        )
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_nested_brackets_and_postfix() {
    let layout = InputRow::new(vec![
        InputNode::Symbol("(".to_string()),
        InputNode::Symbol("(".to_string()),
        InputNode::Symbol("(".to_string()),
        InputNode::Symbol("a".to_string()),
        InputNode::Symbol("!".to_string()),
        InputNode::Symbol(")".to_string()),
        InputNode::Symbol(")".to_string()),
        InputNode::Symbol(")".to_string()),
    ]);
    let context = ParserRules::default();

    let parsed = parse_row(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        format!(
            "{}{}{}",
            r#"(Core::RoundBrackets (BuiltIn::Operator "(") (Core::RoundBrackets (BuiltIn::Operator "(") (Core::RoundBrackets (BuiltIn::Operator "(") "#,
            r#"(Unsorted::Factorial (Core::Variable "a") (BuiltIn::Operator "!")) "#,
            r#"(BuiltIn::Operator ")")) (BuiltIn::Operator ")")) (BuiltIn::Operator ")"))"#
        )
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_tuple() {
    let layout = InputRow::new(vec![
        InputNode::Symbol("a".to_string()),
        InputNode::Symbol(",".to_string()),
        InputNode::Symbol("b".to_string()),
    ]);

    let context = ParserRules::default();

    let parsed = parse_row(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        r#"(Collections::Tuple (Core::Variable "a") (BuiltIn::Operator ",") (Core::Variable "b"))"#
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_tuple_advanced() {
    let layout = InputRow::new(vec![
        InputNode::Symbol("(".to_string()),
        InputNode::Symbol("a".to_string()),
        InputNode::Symbol(",".to_string()),
        InputNode::Symbol("b".to_string()),
        InputNode::Symbol(",".to_string()),
        InputNode::Symbol("c".to_string()),
        InputNode::Symbol(")".to_string()),
    ]);

    let context = ParserRules::default();

    let parsed = parse_row(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        format!(
            "{}{}{}",
            r#"(Core::RoundBrackets (BuiltIn::Operator "(") "#,
            r#"(Collections::Tuple (Collections::Tuple (Core::Variable "a") (BuiltIn::Operator ",") (Core::Variable "b")) (BuiltIn::Operator ",") (Core::Variable "c")) "#,
            r#"(BuiltIn::Operator ")"))"#
        )
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_function_call() {
    let layout = InputRow::new(vec![
        InputNode::Symbol("f".to_string()),
        InputNode::Symbol("(".to_string()),
        InputNode::Symbol("a".to_string()),
        InputNode::Symbol(",".to_string()),
        InputNode::Symbol("b".to_string()),
        InputNode::Symbol(")".to_string()),
    ]);

    let context = ParserRules::default();

    let parsed = parse_row(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        format!(
            "{}{}{}",
            r#"(Function::FunctionApplication (Core::Variable "f") (BuiltIn::Operator "(") ("#,
            r#"Collections::Tuple (Core::Variable "a") (BuiltIn::Operator ",") (Core::Variable "b")"#,
            r#") (BuiltIn::Operator ")"))"#
        )
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_brackets_with_addition() {
    let layout = InputRow::new(vec![
        InputNode::Symbol("(".to_string()),
        InputNode::Symbol("a".to_string()),
        InputNode::Symbol("+".to_string()),
        InputNode::Symbol("b".to_string()),
        InputNode::Symbol(")".to_string()),
    ]);

    let context = ParserRules::default();
    let parsed = parse_row(&layout, &context);

    assert_eq!(
        parsed.value.to_string(),
        r#"(Core::RoundBrackets (BuiltIn::Operator "(") (Arithmetic::Add (Core::Variable "a") (BuiltIn::Operator "+") (Core::Variable "b")) (BuiltIn::Operator ")"))"#
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_fraction() {
    let layout = InputRow::new(vec![
        InputNode::Symbol("(".to_string()),
        InputNode::Symbol("a".to_string()),
        InputNode::Symbol("+".to_string()),
        InputNode::Fraction([
            InputRow::new(vec![InputNode::Symbol("b".to_string())]),
            InputRow::new(vec![InputNode::Symbol("c".to_string())]),
        ]),
        InputNode::Symbol(")".to_string()),
    ]);

    let context = ParserRules::default();
    let parsed = parse_row(&layout, &context);

    assert_eq!(
        parsed.value.to_string(),
        r#"(Core::RoundBrackets (BuiltIn::Operator "(") (Arithmetic::Add (Core::Variable "a") (BuiltIn::Operator "+") (BuiltIn::Fraction (Core::Variable "b") (Core::Variable "c"))) (BuiltIn::Operator ")"))"#
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_empty_input() {
    let layout = InputRow::new(vec![]);
    let context = ParserRules::default();

    let parsed = parse_row(&layout, &context);
    // "Nothing" is taken from https://cortexjs.io/compute-engine/reference/core/
    assert_eq!(parsed.value.to_string(), "(BuiltIn::Nothing)");
}

#[test]
fn test_parser_empty_squareroot() {
    // A square root is one of the few places in mathematics, where a default value exists
    // $ \sqrt{a} = \sqrt[2]{a}$
    let layout = InputRow::new(vec![InputNode::Root([
        InputRow::new(vec![]),
        InputRow::new(vec![InputNode::Symbol("a".to_string())]),
    ])]);
    let context = ParserRules::default();

    let parsed = parse_row(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        r#"(BuiltIn::Root (BuiltIn::Nothing) (Core::Variable "a"))"#
    );
}

// TODO: Fix those tests to actually do something instead of printing stuff
#[test]
fn test_parser_symbol_and_close_bracket() {
    let layout = InputRow::new(vec![
        InputNode::Symbol("a".to_string()),
        InputNode::Symbol(")".to_string()),
    ]);
    let context = ParserRules::default();

    let parsed = parse_row(&layout, &context);
    println!("{:?}", parsed);
}

#[test]
fn test_parser_close_bracket() {
    let layout = InputRow::new(vec![InputNode::Symbol(")".to_string())]);
    let context = ParserRules::default();

    let parsed = parse_row(&layout, &context);
    println!("{:?}", parsed);
}
