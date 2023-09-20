use input_tree::input_nodes;
use parser::autocomplete::{AutocompleteMatcher, AutocompleteRule, AutocompleteRules};

fn test_rules<'a>() -> AutocompleteRules {
    let autocomplete_rules = vec![
        AutocompleteRule::new("/", input_nodes! {(fraction (row), (row))}),
        AutocompleteRule::new("sqrt", input_nodes! {(root (row), (row))}),
        AutocompleteRule::new("^", input_nodes! {(sup (row))}),
        AutocompleteRule::new("infinity", input_nodes! {"∞"}),
        AutocompleteRule::new("lim", input_nodes! {"l", "i", "m"}),
        AutocompleteRule::new("limsup", input_nodes! {"l", "i", "m", "s", "u", "p"}),
        AutocompleteRule::new("liminf", input_nodes! {"l", "i", "m", "i", "n", "f"}),
        AutocompleteRule::new("sum", input_nodes! {"∑"}),
        AutocompleteRule::new("integral", input_nodes! {"∫"}),
        AutocompleteRule::new("integrate", input_nodes! {"∫"}),
    ];

    AutocompleteRules(autocomplete_rules)
}

#[test]
fn test_autocomplete() {
    let input = input_nodes! {"l", "i"};
    let context = test_rules();
    let result = context.matches(&input, input.len(), 0);
    assert!(!result.is_empty());
    assert_eq!(result.len(), 3);
}

#[test]
fn test_autocomplete_empty() {
    let input = vec![];
    let context = test_rules();
    let result = context.matches(&input, input.len(), 0);
    assert!(result.is_empty());
}

#[test]
fn test_autocomplete_full_match() {
    let input = input_nodes! {"l", "i", "m"};
    let context = test_rules();
    let result = context.matches(&input, input.len(), 0);
    assert!(!result.is_empty());
    assert_eq!(result.len(), 3);
}

#[test]
fn test_autocomplete_single_match() {
    let input = input_nodes! {"l", "i", "m", "s", "u"};
    let context = test_rules();
    let result = context.matches(&input, input.len(), 0);
    assert!(!result.is_empty());
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].input_match_length, 5);
    assert_eq!(result[0].rule_match_length, 5);
}

#[test]
fn test_autocomplete_standard_symbol_match() {
    // parsed like an ordinary variable called "ligm"
    let input = input_nodes! {"l", "i", "g", "m"};
    let context = test_rules();
    let result = context.matches(&input, input.len(), 0);
    assert!(result.is_empty());
}

#[test]
fn test_autocomplete_no_match_followed_by_match() {
    // remember to filter out autocompletes that might destroy an existing token
    let input = input_nodes! {"c", "l", "i", "l", "i", "m"};
    let context = test_rules();
    let result = context.matches(&input, input.len(), 0);
    assert!(!result.is_empty());
    assert_eq!(result.len(), 3);
}

#[test]
fn test_autocomplete_match_followed_by_autocomplete_match() {
    let input = input_nodes! {"l", "i", "m", "l", "i", "m"};
    let context = test_rules();
    let result = context.matches(&input, input.len(), 0);
    assert!(!result.is_empty());
    assert_eq!(result.len(), 3);
}
