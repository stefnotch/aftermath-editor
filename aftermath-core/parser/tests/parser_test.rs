use math_layout::{element::MathElement, row::Row};
use parser::{parse, parse_context::ParseContext};

#[test]
fn test_parser() {
    let layout = Row::new(vec![
        MathElement::Symbol("-".to_string()),
        MathElement::Symbol("b".to_string()),
        MathElement::Symbol("*".to_string()),
        MathElement::Symbol("C".to_string()),
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
    let layout = Row::new(vec![
        MathElement::Symbol("c".to_string()),
        MathElement::Symbol("+".to_string()),
        MathElement::Symbol("a".to_string()),
        MathElement::Symbol("!".to_string()),
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
    let layout = Row::new(vec![
        MathElement::Symbol("(".to_string()),
        MathElement::Symbol("(".to_string()),
        MathElement::Symbol("(".to_string()),
        MathElement::Symbol("a".to_string()),
        MathElement::Symbol("!".to_string()),
        MathElement::Symbol(")".to_string()),
        MathElement::Symbol(")".to_string()),
        MathElement::Symbol(")".to_string()),
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
    let layout = Row::new(vec![
        MathElement::Symbol("a".to_string()),
        MathElement::Symbol(",".to_string()),
        MathElement::Symbol("b".to_string()),
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
    let layout = Row::new(vec![
        MathElement::Symbol("(".to_string()),
        MathElement::Symbol("a".to_string()),
        MathElement::Symbol(",".to_string()),
        MathElement::Symbol("b".to_string()),
        MathElement::Symbol(",".to_string()),
        MathElement::Symbol("c".to_string()),
        MathElement::Symbol(")".to_string()),
    ]);

    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    // Not entirely satisfactory, but eh
    assert_eq!(
        parsed.value.to_string(),
        "(() () (Tuple () (Tuple () (Variable (61)) (Variable (62))) (Variable (63))))"
    );
    assert_eq!(parsed.errors.len(), 0);
}

#[test]
fn test_parser_function_call() {
    let layout = Row::new(vec![
        MathElement::Symbol("f".to_string()),
        MathElement::Symbol("(".to_string()),
        MathElement::Symbol("a".to_string()),
        MathElement::Symbol(",".to_string()),
        MathElement::Symbol("b".to_string()),
        MathElement::Symbol(")".to_string()),
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
fn test_parser_fraction() {
    let layout = Row::new(vec![
        MathElement::Symbol("(".to_string()),
        MathElement::Symbol("a".to_string()),
        MathElement::Symbol("+".to_string()),
        MathElement::Fraction([
            Row::new(vec![MathElement::Symbol("b".to_string())]),
            Row::new(vec![MathElement::Symbol("c".to_string())]),
        ]),
        MathElement::Symbol(")".to_string()),
    ]);

    let context = ParseContext::default();
    let parsed = parse(&layout, &context);
}

// TODO: Fix those tests to actually do something instead of printing stuff
#[test]
fn test_parser_empty_input() {
    let layout = Row::new(vec![]);
    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    assert_eq!(parsed.errors.len(), 1);

    println!("{:?}", parsed);
}

#[test]
fn test_parser_symbol_and_close_bracket() {
    let layout = Row::new(vec![
        MathElement::Symbol("a".to_string()),
        MathElement::Symbol(")".to_string()),
    ]);
    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    println!("{:?}", parsed);
}

#[test]
fn test_parser_close_bracket() {
    let layout = Row::new(vec![MathElement::Symbol(")".to_string())]);
    let context = ParseContext::default();

    let parsed = parse(&layout, &context);
    println!("{:?}", parsed);
}
