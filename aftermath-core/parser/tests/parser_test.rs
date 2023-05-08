use input_tree::{element::InputElement, row::InputRow};
use parser::{parse, parse_context::ParseContext};

#[test]
fn test_parser() {
    let layout = InputRow::new(vec![
        InputElement::Symbol("-".to_string()),
        InputElement::Symbol("b".to_string()),
        InputElement::Symbol("*".to_string()),
        InputElement::Symbol("C".to_string()),
    ]);

    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        "(Multiply () (Subtract () (Variable (62))) (Variable (43)))"
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_postfix() {
    let layout = InputRow::new(vec![
        InputElement::Symbol("c".to_string()),
        InputElement::Symbol("+".to_string()),
        InputElement::Symbol("a".to_string()),
        InputElement::Symbol("!".to_string()),
    ]);

    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        "(Add () (Variable (63)) (Factorial () (Variable (61))))"
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_nested_brackets_and_postfix() {
    let layout = InputRow::new(vec![
        InputElement::Symbol("(".to_string()),
        InputElement::Symbol("(".to_string()),
        InputElement::Symbol("(".to_string()),
        InputElement::Symbol("a".to_string()),
        InputElement::Symbol("!".to_string()),
        InputElement::Symbol(")".to_string()),
        InputElement::Symbol(")".to_string()),
        InputElement::Symbol(")".to_string()),
    ]);
    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        "(RoundBrackets () (RoundBrackets () (RoundBrackets () (Factorial () (Variable (61))))))"
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_tuple() {
    let layout = InputRow::new(vec![
        InputElement::Symbol("a".to_string()),
        InputElement::Symbol(",".to_string()),
        InputElement::Symbol("b".to_string()),
    ]);

    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        "(Tuple () (Variable (61)) (Variable (62)))"
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_tuple_advanced() {
    let layout = InputRow::new(vec![
        InputElement::Symbol("(".to_string()),
        InputElement::Symbol("a".to_string()),
        InputElement::Symbol(",".to_string()),
        InputElement::Symbol("b".to_string()),
        InputElement::Symbol(",".to_string()),
        InputElement::Symbol("c".to_string()),
        InputElement::Symbol(")".to_string()),
    ]);

    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    // Not entirely satisfactory, but eh
    assert_eq!(
        parsed.value.to_string(),
        "(RoundBrackets () (Tuple () (Tuple () (Variable (61)) (Variable (62))) (Variable (63))))"
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_function_call() {
    let layout = InputRow::new(vec![
        InputElement::Symbol("f".to_string()),
        InputElement::Symbol("(".to_string()),
        InputElement::Symbol("a".to_string()),
        InputElement::Symbol(",".to_string()),
        InputElement::Symbol("b".to_string()),
        InputElement::Symbol(")".to_string()),
    ]);

    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    // TODO: Document that the first argument is the function name
    // and the second argument is a tuple of arguments
    assert_eq!(
        parsed.value.to_string(),
        "(FunctionApplication () (Variable (66)) (Tuple () (Variable (61)) (Variable (62))))"
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_brackets_with_addition() {
    let layout = InputRow::new(vec![
        InputElement::Symbol("(".to_string()),
        InputElement::Symbol("a".to_string()),
        InputElement::Symbol("+".to_string()),
        InputElement::Symbol("b".to_string()),
        InputElement::Symbol(")".to_string()),
    ]);

    let context = ParseContext::default();
    let parsed = parse(&layout, &context);

    assert_eq!(
        parsed.value.to_string(),
        "(RoundBrackets () (Add () (Variable (61)) (Variable (62))))"
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_fraction() {
    let layout = InputRow::new(vec![
        InputElement::Symbol("(".to_string()),
        InputElement::Symbol("a".to_string()),
        InputElement::Symbol("+".to_string()),
        InputElement::Fraction([
            InputRow::new(vec![InputElement::Symbol("b".to_string())]),
            InputRow::new(vec![InputElement::Symbol("c".to_string())]),
        ]),
        InputElement::Symbol(")".to_string()),
    ]);

    let context = ParseContext::default();
    let parsed = parse(&layout, &context);

    assert_eq!(
        parsed.value.to_string(),
        "(RoundBrackets () (Add () (Variable (61)) (Fraction () (Variable (62)) (Variable (63)))))"
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_empty_input() {
    let layout = InputRow::new(vec![]);
    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    // "Nothing" is taken from https://cortexjs.io/compute-engine/reference/core/
    assert_eq!(parsed.value.to_string(), "(Nothing)");
}

#[test]
fn test_parser_empty_squareroot() {
    // A square root is one of the few places in mathematics, where a default value exists
    // $ \sqrt{a} = \sqrt[2]{a}$
    let layout = InputRow::new(vec![InputElement::Root([
        InputRow::new(vec![]),
        InputRow::new(vec![InputElement::Symbol("a".to_string())]),
    ])]);
    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    assert_eq!(
        parsed.value.to_string(),
        "(Root () (Nothing) (Variable (61)))"
    );
}

// TODO: Fix those tests to actually do something instead of printing stuff
#[test]
fn test_parser_symbol_and_close_bracket() {
    let layout = InputRow::new(vec![
        InputElement::Symbol("a".to_string()),
        InputElement::Symbol(")".to_string()),
    ]);
    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    println!("{:?}", parsed);
}

#[test]
fn test_parser_close_bracket() {
    let layout = InputRow::new(vec![InputElement::Symbol(")".to_string())]);
    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    println!("{:?}", parsed);
}
