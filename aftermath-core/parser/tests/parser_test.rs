use input_tree::{node::InputNode, row::InputRow};
use parser::{
    parser::ParserBuilder,
    rule_collections::{
        arithmetic_rules::ArithmeticRules, built_in_rules::BuiltInRules,
        calculus_rules::CalculusRules, collections_rules::CollectionsRules,
        comparison_rules::ComparisonRules, core_rules::CoreRules, function_rules::FunctionRules,
        logic_rules::LogicRules, string_rules::StringRules,
    },
};

fn create_parser() -> parser::parser::MathParser {
    let builder = ParserBuilder::new()
        .add_rule_collection::<BuiltInRules>()
        .add_rule_collection::<CoreRules>()
        .add_rule_collection::<ArithmeticRules>()
        .add_rule_collection::<CalculusRules>()
        .add_rule_collection::<CollectionsRules>()
        .add_rule_collection::<ComparisonRules>()
        .add_rule_collection::<FunctionRules>()
        .add_rule_collection::<LogicRules>()
        .add_rule_collection::<StringRules>();
    let parser = builder.build();
    parser
}

fn parse_row(row: &InputRow) -> parser::syntax_tree::SyntaxNode {
    create_parser().parse(&row.values)
}

#[test]
fn test_parser() {
    let layout = InputRow::new(vec![
        InputNode::symbol("-"),
        InputNode::symbol("b"),
        InputNode::symbol("*"),
        InputNode::symbol("C"),
    ]);
    let parsed = parse_row(&layout);
    assert_eq!(
        parsed.to_string(),
        r#"(Arithmetic::Multiply (Arithmetic::Subtract (BuiltIn::Operator "-") (Core::Variable "b")) (BuiltIn::Operator "*") (Core::Variable "C"))"#
    );
}

#[test]
fn test_postfix() {
    let layout = InputRow::new(vec![
        InputNode::symbol("c"),
        InputNode::symbol("+"),
        InputNode::symbol("a"),
        InputNode::symbol("!"),
    ]);
    let parsed = parse_row(&layout);
    assert_eq!(
        parsed.to_string(),
        r#"(Arithmetic::Add (Core::Variable "c") (BuiltIn::Operator "+") (Unsorted::Factorial (Core::Variable "a") (BuiltIn::Operator "!")))"#
    );
}

#[test]
fn test_sub() {
    let layout = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]);

    let parsed = parse_row(&layout);
    assert_eq!(
        parsed.to_string(),
        r#"(BuiltIn::Sub (Core::Variable "a") (BuiltIn::Row 1x1 (Arithmetic::Number "1")))"#
    );
}

#[test]
fn test_sup_sub() {
    let layout = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sup(InputRow::new(vec![InputNode::symbol("1")])),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("2")])),
    ]);

    let parsed = parse_row(&layout);
    assert_eq!(
        parsed.to_string(),
        format!(
            "{}{}{}",
            r#"(BuiltIn::Sub "#,
            r#"(BuiltIn::Sup (Core::Variable "a") (BuiltIn::Row 1x1 (Arithmetic::Number "1")))"#,
            r#" (BuiltIn::Row 1x1 (Arithmetic::Number "2")))"#
        )
    );
}

#[test]
fn test_parser_nested_brackets_and_postfix() {
    let layout = InputRow::new(vec![
        InputNode::symbol("("),
        InputNode::symbol("("),
        InputNode::symbol("("),
        InputNode::symbol("a"),
        InputNode::symbol("!"),
        InputNode::symbol(")"),
        InputNode::symbol(")"),
        InputNode::symbol(")"),
    ]);

    let parsed = parse_row(&layout);
    assert_eq!(
        parsed.to_string(),
        format!(
            "{}{}{}",
            r#"(Core::RoundBrackets (BuiltIn::Operator "(") (Core::RoundBrackets (BuiltIn::Operator "(") (Core::RoundBrackets (BuiltIn::Operator "(") "#,
            r#"(Unsorted::Factorial (Core::Variable "a") (BuiltIn::Operator "!")) "#,
            r#"(BuiltIn::Operator ")")) (BuiltIn::Operator ")")) (BuiltIn::Operator ")"))"#
        )
    );
}

#[test]
fn test_parser_tuple() {
    let layout = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::symbol(","),
        InputNode::symbol("b"),
    ]);

    let parsed = parse_row(&layout);
    assert_eq!(
        parsed.to_string(),
        r#"(Collection::Tuple (Core::Variable "a") (BuiltIn::Operator ",") (Core::Variable "b"))"#
    );
}

#[test]
fn test_parser_tuple_advanced() {
    let layout = InputRow::new(vec![
        InputNode::symbol("("),
        InputNode::symbol("a"),
        InputNode::symbol(","),
        InputNode::symbol("b"),
        InputNode::symbol(","),
        InputNode::symbol("c"),
        InputNode::symbol(")"),
    ]);

    let parsed = parse_row(&layout);
    assert_eq!(
        parsed.to_string(),
        format!(
            "{}{}{}",
            r#"(Core::RoundBrackets (BuiltIn::Operator "(") "#,
            r#"(Collection::Tuple (Collection::Tuple (Core::Variable "a") (BuiltIn::Operator ",") (Core::Variable "b")) (BuiltIn::Operator ",") (Core::Variable "c")) "#,
            r#"(BuiltIn::Operator ")"))"#
        )
    );
}

#[test]
fn test_parser_function_call() {
    let layout = InputRow::new(vec![
        InputNode::symbol("f"),
        InputNode::symbol("("),
        InputNode::symbol("a"),
        InputNode::symbol(","),
        InputNode::symbol("b"),
        InputNode::symbol(")"),
    ]);

    let parsed = parse_row(&layout);
    assert_eq!(
        parsed.to_string(),
        format!(
            "{}{}{}",
            r#"(Function::FunctionApplication (Core::Variable "f") (BuiltIn::Operator "(") ("#,
            r#"Collection::Tuple (Core::Variable "a") (BuiltIn::Operator ",") (Core::Variable "b")"#,
            r#") (BuiltIn::Operator ")"))"#
        )
    );
}

#[test]
fn test_parser_brackets_with_addition() {
    let layout = InputRow::new(vec![
        InputNode::symbol("("),
        InputNode::symbol("a"),
        InputNode::symbol("+"),
        InputNode::symbol("b"),
        InputNode::symbol(")"),
    ]);

    let parsed = parse_row(&layout);

    assert_eq!(
        parsed.to_string(),
        r#"(Core::RoundBrackets (BuiltIn::Operator "(") (Arithmetic::Add (Core::Variable "a") (BuiltIn::Operator "+") (Core::Variable "b")) (BuiltIn::Operator ")"))"#
    );
}

#[test]
fn test_parser_fraction() {
    let layout = InputRow::new(vec![
        InputNode::symbol("("),
        InputNode::symbol("a"),
        InputNode::symbol("+"),
        InputNode::fraction([
            InputRow::new(vec![InputNode::symbol("b")]),
            InputRow::new(vec![InputNode::symbol("c")]),
        ]),
        InputNode::symbol(")"),
    ]);

    let parsed = parse_row(&layout);

    assert_eq!(
        parsed.to_string(),
        r#"(Core::RoundBrackets (BuiltIn::Operator "(") (Arithmetic::Add (Core::Variable "a") (BuiltIn::Operator "+") (BuiltIn::Fraction 1x2 (Core::Variable "b") (Core::Variable "c"))) (BuiltIn::Operator ")"))"#
    );
}

#[test]
fn test_parser_empty_input() {
    let layout = InputRow::new(vec![]);

    let parsed = parse_row(&layout);
    // "Nothing" is taken from https://cortexjs.io/compute-engine/reference/core/
    assert_eq!(parsed.to_string(), "(BuiltIn::Nothing)");
}

#[test]
fn test_parser_empty_squareroot() {
    // A square root is one of the few places in mathematics, where a default value exists
    // $ \sqrt{a} = \sqrt[2]{a}$
    let layout = InputRow::new(vec![InputNode::root([
        InputRow::new(vec![]),
        InputRow::new(vec![InputNode::symbol("a")]),
    ])]);

    let parsed = parse_row(&layout);
    assert_eq!(
        parsed.to_string(),
        r#"(BuiltIn::Root 2x1 (BuiltIn::Nothing) (Core::Variable "a"))"#
    );
}

// TODO: Add tests for tables
// TODO: Fix those tests to actually do something instead of printing stuff
#[test]
fn test_parser_symbol_and_close_bracket() {
    let layout = InputRow::new(vec![InputNode::symbol("a"), InputNode::symbol(")")]);

    let parsed = parse_row(&layout);
    println!("{:?}", parsed);
}

#[test]
fn test_parser_close_bracket() {
    let layout = InputRow::new(vec![InputNode::symbol(")")]);

    let parsed = parse_row(&layout);
    println!("{:?}", parsed);
}
