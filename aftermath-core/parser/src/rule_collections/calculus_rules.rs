use crate::make_parser::{just_operator_parser, just_symbol_parser};

use crate::{
    autocomplete::AutocompleteRule,
    rule_collection::{RuleCollection, TokenRule},
    syntax_tree::NodeIdentifier,
};

use input_tree::input_nodes;

/// Rules for basic calculus.
pub struct CalculusRules {}

impl CalculusRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Calculus".into(), name.into()])
    }
}
impl RuleCollection for CalculusRules {
    fn get_rules() -> Vec<TokenRule> {
        vec![
            TokenRule::new(
                Self::rule_name("Infinity"),
                (None, None),
                just_symbol_parser("∞"),
            ),
            TokenRule::new(
                Self::rule_name("Lim"),
                (None, Some(100)),
                just_operator_parser(vec!['l', 'i', 'm']),
            ),
            TokenRule::new(
                Self::rule_name("LimSup"),
                (None, Some(100)),
                just_operator_parser(vec!['l', 'i', 'm', 's', 'u', 'p']),
            ),
            TokenRule::new(
                Self::rule_name("LimInf"),
                (None, Some(100)),
                just_operator_parser(vec!['l', 'i', 'm', 'i', 'n', 'f']),
            ),
            TokenRule::new(
                Self::rule_name("Sum"),
                (None, Some(100)),
                just_operator_parser('∑'),
            ),
            TokenRule::new(
                Self::rule_name("Integral"),
                (None, Some(100)),
                just_operator_parser('∫'),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![
            AutocompleteRule::new("infinity", input_nodes! {"∞"}),
            AutocompleteRule::new("lim", input_nodes! {"l", "i", "m"}),
            AutocompleteRule::new("limsup", input_nodes! {"l", "i", "m", "s", "u", "p"}),
            AutocompleteRule::new("liminf", input_nodes! {"l", "i", "m", "i", "n", "f"}),
            AutocompleteRule::new("sum", input_nodes! {"∑"}),
            AutocompleteRule::new("integral", input_nodes! {"∫"}),
            AutocompleteRule::new("integrate", input_nodes! {"∫"}),
        ]
    }
}
