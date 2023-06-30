use input_tree::input_node::InputNode;
use parser::parse_rules::ParserRules;

#[test]
fn test_autocomplete() {
    let input = InputNode::symbols(vec!["l", "i"]);
    let context = ParserRules::default();
    let result = context.get_autocomplete(&input);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].range_in_input, 0..2);
    assert_eq!(result[0].potential_rules.len(), 3);
}

#[test]
fn test_autocomplete_empty() {
    let input = vec![];
    let context = ParserRules::default();
    let result = context.get_autocomplete(&input);
    assert_eq!(result.len(), 0);
}

#[test]
fn test_autocomplete_full_match() {
    let input = InputNode::symbols(vec!["l", "i", "m"]);
    let context = ParserRules::default();
    let result = context.get_autocomplete(&input);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].range_in_input, 0..3);
    assert_eq!(result[0].potential_rules.len(), 3);
}

#[test]
fn test_autocomplete_single_match() {
    let input = InputNode::symbols(vec!["l", "i", "m", "s", "u"]);
    let context = ParserRules::default();
    let result = context.get_autocomplete(&input);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].range_in_input, 0..5);
    assert_eq!(result[0].potential_rules.len(), 1);
}

#[test]
fn test_autocomplete_standard_symbol_match() {
    // parsed like an ordinary variable called "ligm"
    let input = InputNode::symbols(vec!["l", "i", "g", "m"]);
    let context = ParserRules::default();
    let result = context.get_autocomplete(&input);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].range_in_input, 0..4);
    assert_eq!(result[0].potential_rules.len(), 0);
}

#[test]
fn test_autocomplete_match_followed_by_no_match() {
    let input = InputNode::symbols(vec!["l", "i", "m", "x"]);
    let context = ParserRules::default();
    let result = context.get_autocomplete(&input);
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].range_in_input, 0..3);
    assert_eq!(result[0].potential_rules.len(), 1);
    assert_eq!(result[1].range_in_input, 3..4);
    assert_eq!(result[1].potential_rules.len(), 0);
}

#[test]
fn test_autocomplete_no_match_followed_by_match() {
    // Like in any normal autocomplete, this is going to give zero autocomplete results
    let input = InputNode::symbols(vec!["c", "l", "i", "l", "i", "m"]);
    let context = ParserRules::default();
    let result = context.get_autocomplete(&input);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].range_in_input, 0..6);
    assert_eq!(result[0].potential_rules.len(), 0);
}

#[test]
fn test_autocomplete_match_followed_by_autocomplete_match() {
    let input = InputNode::symbols(vec!["l", "i", "m", "l", "i", "m"]);
    let context = ParserRules::default();
    let result = context.get_autocomplete(&input);
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].range_in_input, 0..3);
    assert_eq!(result[0].potential_rules.len(), 1);
    assert_eq!(result[1].range_in_input, 3..6);
    assert_eq!(result[1].potential_rules.len(), 3);
}
