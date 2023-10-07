use std::rc::Rc;

use input_tree::{input_row, node::InputNode, row::InputRow};
use parser::{
    parse_modules::{ParseModuleCollection, ParseModules},
    rule_collections::{
        arithmetic_rules::ArithmeticRules, built_in_rules::BuiltInRules,
        calculus_rules::CalculusRules, collections_rules::CollectionsRules,
        comparison_rules::ComparisonRules, core_rules::CoreRules, function_rules::FunctionRules,
        logic_rules::LogicRules, string_rules::StringRules,
    },
    syntax_tree::SyntaxNode,
};

fn create_parser() -> (parser::parser::MathParser, ParseModules) {
    let mut modules = ParseModules::new();
    let built_in = Rc::new(BuiltInRules::new(&mut modules));
    let core = Rc::new(CoreRules::new(&mut modules, &built_in));
    let arithmetic = Rc::new(ArithmeticRules::new(&mut modules));
    let calculus = Rc::new(CalculusRules::new(&mut modules));
    let collections = Rc::new(CollectionsRules::new(&mut modules));
    let comparison = Rc::new(ComparisonRules::new(&mut modules));
    let function = Rc::new(FunctionRules::new(&mut modules, &built_in));
    let logic = Rc::new(LogicRules::new(&mut modules));
    let string = Rc::new(StringRules::new(&mut modules));

    let module_collection = ParseModuleCollection::new(
        built_in.clone(),
        vec![
            built_in,
            core,
            arithmetic,
            calculus,
            collections,
            comparison,
            function,
            logic,
            string,
        ],
    );
    (parser::parser::MathParser::new(module_collection), modules)
}

fn parse_row(row: &InputRow) -> (SyntaxNode, ParseModules) {
    let (parser, modules) = create_parser();
    let parsed = parser.parse(&row.values);
    (parsed, modules)
}

#[test]
fn test_parser() {
    let layout = input_row! {(row "-", "b", "*", "C")};
    let (parsed, modules) = parse_row(&layout);

    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
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
    let (parsed, modules) = parse_row(&layout);
    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
        r#"(Arithmetic::Add (Core::Variable "c") (BuiltIn::Operator "+") (Arithmetic::Factorial (Core::Variable "a") (BuiltIn::Operator "!")))"#
    );
}

#[test]
fn test_sub() {
    let layout = InputRow::new(vec![
        InputNode::symbol("a"),
        InputNode::sub(InputRow::new(vec![InputNode::symbol("1")])),
    ]);

    let (parsed, modules) = parse_row(&layout);
    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
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

    let (parsed, modules) = parse_row(&layout);
    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
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

    let (parsed, modules) = parse_row(&layout);
    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
        format!(
            "{}{}{}",
            r#"(Core::RoundBrackets (BuiltIn::Operator "(") (Core::RoundBrackets (BuiltIn::Operator "(") (Core::RoundBrackets (BuiltIn::Operator "(") "#,
            r#"(Arithmetic::Factorial (Core::Variable "a") (BuiltIn::Operator "!")) "#,
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

    let (parsed, modules) = parse_row(&layout);
    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
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

    let (parsed, modules) = parse_row(&layout);
    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
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

    let (parsed, modules) = parse_row(&layout);
    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
        format!(
            "{}{}{}",
            r#"(Function::FunctionApplication (Core::Variable "f") (BuiltIn::Argument (BuiltIn::Operator "(") ("#,
            r#"Collection::Tuple (Core::Variable "a") (BuiltIn::Operator ",") (Core::Variable "b")"#,
            r#") (BuiltIn::Operator ")")))"#
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

    let (parsed, modules) = parse_row(&layout);

    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
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

    let (parsed, modules) = parse_row(&layout);

    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
        r#"(Core::RoundBrackets (BuiltIn::Operator "(") (Arithmetic::Add (Core::Variable "a") (BuiltIn::Operator "+") (BuiltIn::Fraction 1x2 (Core::Variable "b") (Core::Variable "c"))) (BuiltIn::Operator ")"))"#
    );
}

#[test]
fn test_parser_empty_input() {
    let layout = InputRow::new(vec![]);

    let (parsed, modules) = parse_row(&layout);
    // "Nothing" is taken from https://cortexjs.io/compute-engine/reference/core/
    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
        "(Error::MissingToken)"
    );
}

#[test]
fn test_parser_empty_squareroot() {
    // A square root is one of the few places in mathematics, where a default value exists
    // $ \sqrt{a} = \sqrt[2]{a}$
    let layout = InputRow::new(vec![InputNode::root([
        InputRow::new(vec![]),
        InputRow::new(vec![InputNode::symbol("a")]),
    ])]);

    let (parsed, modules) = parse_row(&layout);
    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
        r#"(BuiltIn::Root 2x1 (Error::MissingToken) (Core::Variable "a"))"#
    );
}

#[test]
fn test_parser_empty_brackets() {
    let layout = input_row! {(row "a", "+", "(", ")")};
    let (parsed, modules) = parse_row(&layout);
    assert_eq!(
        parsed.with_display(modules.get_rule_name_map()).to_string(),
        r#"(Arithmetic::Add (Core::Variable "a") (BuiltIn::Operator "+") (Core::RoundBrackets (BuiltIn::Operator "(") (BuiltIn::Operator ")")))"#
    );
}

// TODO: Add tests for tables
// TODO: Add more default tokens
// Document that \x basically means "this has a very specific meaning", such as \| always being a | symbol, and \sum always being a sum symbol.
// Parse || abs || and their escaped \|| variants
// 4. Parser for whitespace
// 5. Parser for chains of < <=, which could be treated as a "domain restriction"

// TODO: The dx at the end of an integral might not even be a closing bracket.
// After all, it can also sometimes appear inside an integral.

// TODO: Write tests for sum_{n=0}^{10} n^2
