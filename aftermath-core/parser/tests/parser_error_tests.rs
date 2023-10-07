use std::rc::Rc;

use input_tree::{input_row, row::InputRow};
use parser::{
    parse_modules::{ParseModuleCollection, ParseModules},
    rule_collections::{
        arithmetic_rules::ArithmeticRules, built_in_rules::BuiltInRules,
        calculus_rules::CalculusRules, collections_rules::CollectionsRules,
        comparison_rules::ComparisonRules, core_rules::CoreRules, function_rules::FunctionRules,
        logic_rules::LogicRules, string_rules::StringRules,
    },
};

fn create_parser() -> parser::parser::MathParser {
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
    parser::parser::MathParser::new(module_collection)
}

fn parse_row(row: &InputRow) -> parser::syntax_tree::SyntaxNode {
    create_parser().parse(&row.values)
}

#[test]
fn test_parser_missing_atom_after_prefix() {
    let layout = input_row! {(row "-")};
    let parsed = parse_row(&layout);
    println!("{:?}", parsed);
}

#[test]
fn test_parser_missing_atom_after_infix() {
    let layout = input_row! {(row "a", "+")};
    let parsed = parse_row(&layout);
    println!("{:?}", parsed);
}

// TODO: Fix those tests to actually do something instead of printing stuff
#[test]
fn test_parser_symbol_and_close_bracket() {
    let layout = input_row! {(row "a", ")")};

    let parsed = parse_row(&layout);
    println!("{:?}", parsed);
}

#[test]
fn test_parser_close_bracket() {
    let layout = input_row! {(row ")")};

    let parsed = parse_row(&layout);
    println!("{:?}", parsed);
}

// TODO: Write some tests for error recovery
// e.g.
// If the input is "a + \frac{b}{c}" and we don't have a plus parser,
// then "+ \frac{b}{c}" ends up being an error and not rendered correctly/at all.
// This is really bad, since a fraction should always be rendered as a fraction!

// So to fix that, we'll just parse the rest of the input repeatedly.
