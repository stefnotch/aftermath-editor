use input_tree::{input_node::InputNode, row::InputRow};
use parser::{parse, parse_rules::ParserRules};

#[test]
fn test_parser() {
    let layout = InputRow::new(vec![
        InputNode::Symbol("-".to_string()),
        InputNode::Symbol("b".to_string()),
        InputNode::Symbol("*".to_string()),
        InputNode::Symbol("C".to_string()),
    ]);

    let context = ParserRules::default();

    let parsed = parse(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        r#"(Multiply () (Subtract () "-" (Variable () "b")) "*" (Variable () "C"))"#
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

    let parsed = parse(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        r#"(Add () (Variable () "c") "+" (Factorial () (Variable () "a") "!"))"#
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

    let parsed = parse(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        r#"(RoundBrackets () "(" (RoundBrackets () "(" (RoundBrackets () "(" (Factorial () (Variable () "a") "!") ")") ")") ")")"#
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

    let parsed = parse(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        r#"(Tuple () (Variable () "a") "," (Variable () "b"))"#
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

    let parsed = parse(&layout, &context);
    // Not entirely satisfactory, but eh
    assert_eq!(
        parsed.value.to_string(),
        r#"(RoundBrackets () "(" (Tuple () (Tuple () (Variable () "a") "," (Variable () "b")) "," (Variable () "c")) ")")"#
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

    let parsed = parse(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        r#"(FunctionApplication () (Variable () "f") "(" (Tuple () (Variable () "a") "," (Variable () "b")) ")")"#
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
    let parsed = parse(&layout, &context);

    assert_eq!(
        parsed.value.to_string(),
        r#"(RoundBrackets () "(" (Add () (Variable () "a") "+" (Variable () "b")) ")")"#
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
    let parsed = parse(&layout, &context);

    assert_eq!(
        parsed.value.to_string(),
        r#"(RoundBrackets () "(" (Add () (Variable () "a") "+" (Fraction () (Variable () "b") (Variable () "c"))) ")")"#
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_empty_input() {
    let layout = InputRow::new(vec![]);
    let context = ParserRules::default();

    let parsed = parse(&layout, &context);
    // "Nothing" is taken from https://cortexjs.io/compute-engine/reference/core/
    assert_eq!(parsed.value.to_string(), "(Nothing ())");
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

    let parsed = parse(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        r#"(Root () (Nothing ()) (Variable () "a"))"#
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

    let parsed = parse(&layout, &context);
    println!("{:?}", parsed);
}

#[test]
fn test_parser_close_bracket() {
    let layout = InputRow::new(vec![InputNode::Symbol(")".to_string())]);
    let context = ParserRules::default();

    let parsed = parse(&layout, &context);
    println!("{:?}", parsed);
}
