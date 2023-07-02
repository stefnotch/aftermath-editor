use input_tree::input_node::InputNode;
use parser::{
    parse_rules::{
        arithmetic_rules::ArithmeticRules, built_in_rules::BuiltInRules, ParseRuleCollection,
        ParserRules,
    },
    AutocompleteRule,
};

fn test_rules<'a>() -> ParserRules<'a> {
    // TODO: Add more default tokens
    // Document that \x basically means "this has a very specific meaning", such as \| always being a | symbol, and \sum always being a sum symbol.
    // Parse || abs || and their escaped \|| variants
    // 4. Parser for whitespace
    // 5. Parser for chains of < <=, which could be treated as a "domain restriction"

    let mut rules = vec![];
    rules.extend(BuiltInRules::get_rules());
    rules.extend(ArithmeticRules::get_rules());

    let autocomplete_rules = vec![
        AutocompleteRule::new(
            vec![InputNode::fraction([
                Default::default(),
                Default::default(),
            ])],
            "/",
        ),
        AutocompleteRule::new(vec![InputNode::sup(Default::default())], "^"),
        AutocompleteRule::new(vec![InputNode::sub(Default::default())], "_"),
        AutocompleteRule::new(InputNode::symbols(vec!["l", "i", "m"]), "lim"),
        AutocompleteRule::new(
            InputNode::symbols(vec!["l", "i", "m", "s", "u", "p"]),
            "limsup",
        ),
        AutocompleteRule::new(
            InputNode::symbols(vec!["l", "i", "m", "i", "n", "f"]),
            "liminf",
        ),
    ];

    ParserRules::new(None, rules, autocomplete_rules)
}

#[test]
fn test_autocomplete() {
    let input = InputNode::symbols(vec!["l", "i"]);
    let context = test_rules();
    let result = context.get_autocomplete(&input);
    assert!(result.is_some());
    let result = result.unwrap();
    assert_eq!(result.range_in_input, 0..2);
    assert_eq!(result.potential_rules.len(), 3);
}

#[test]
fn test_autocomplete_empty() {
    let input = vec![];
    let context = test_rules();
    let result = context.get_autocomplete(&input);
    assert!(result.is_none());
}

#[test]
fn test_autocomplete_full_match() {
    let input = InputNode::symbols(vec!["l", "i", "m"]);
    let context = test_rules();
    let result = context.get_autocomplete(&input);
    assert!(result.is_some());
    let result = result.unwrap();
    assert_eq!(result.range_in_input, 0..3);
    assert_eq!(result.potential_rules.len(), 3);
}

#[test]
fn test_autocomplete_single_match() {
    let input = InputNode::symbols(vec!["l", "i", "m", "s", "u"]);
    let context = test_rules();
    let result = context.get_autocomplete(&input);
    assert!(result.is_some());
    let result = result.unwrap();
    assert_eq!(result.range_in_input, 0..5);
    assert_eq!(result.potential_rules.len(), 1);
}

#[test]
fn test_autocomplete_standard_symbol_match() {
    // parsed like an ordinary variable called "ligm"
    let input = InputNode::symbols(vec!["l", "i", "g", "m"]);
    let context = test_rules();
    let result = context.get_autocomplete(&input);
    assert!(result.is_none());
}

#[test]
fn test_autocomplete_match_followed_by_no_match() {
    let input = InputNode::symbols(vec!["l", "i", "m", "x"]);
    let context = test_rules();
    let result = context.get_finished_autocomplete_at_beginning(&input);
    assert!(result.is_some());
    let result = result.unwrap();
    assert_eq!(result.range_in_input, 0..3);
    assert_eq!(result.potential_rules.len(), 1);
}

#[test]
fn test_autocomplete_no_match_followed_by_match() {
    // Like in any normal autocomplete, this is going to give zero autocomplete results
    let input = InputNode::symbols(vec!["c", "l", "i", "l", "i", "m"]);
    let context = test_rules();
    let result = context.get_autocomplete(&input);
    assert!(result.is_none());
    let result_b = context.get_finished_autocomplete_at_beginning(&input);
    assert!(result_b.is_none());
}

#[test]
fn test_autocomplete_match_followed_by_autocomplete_match() {
    let input = InputNode::symbols(vec!["l", "i", "m", "l", "i", "m"]);
    let context = test_rules();
    let result = context.get_autocomplete(&input);
    assert!(result.is_none());
    let result_b = context.get_finished_autocomplete_at_beginning(&input);
    assert!(result_b.is_some());
    let result_b = result_b.unwrap();
    assert_eq!(result_b.range_in_input, 0..3);
    assert_eq!(result_b.potential_rules.len(), 1);
}
