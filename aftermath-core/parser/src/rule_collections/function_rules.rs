use crate::rule_collections::core_rules::CoreRules;

use crate::{
    autocomplete::AutocompleteRule,
    rule_collection::{RuleCollection, TokenRule},
    syntax_tree::NodeIdentifier,
};

pub struct FunctionRules {}

impl FunctionRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Function".into(), name.into()])
    }
}
impl RuleCollection for FunctionRules {
    fn get_rules() -> Vec<TokenRule> {
        vec![
            TokenRule::new(
                Self::rule_name("FunctionApplication"),
                (Some(800), None),
                CoreRules::make_brackets_parser("(", ")"),
            ),
            TokenRule::new(
                Self::rule_name("FunctionApplication"),
                (Some(800), None),
                CoreRules::make_empty_brackets_parser("(", ")"),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
