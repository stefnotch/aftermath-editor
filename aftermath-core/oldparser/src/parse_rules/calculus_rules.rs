use input_tree::node::InputNode;

use crate::{
    parse_rules::StartingParser,
    syntax_tree::{LeafNodeType, NodeIdentifier},
    AutocompleteRule,
};

use super::{RuleCollection, TokenParser};

/// Rules for basic calculus.
pub struct CalculusRules {}

impl CalculusRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Calculus".into(), name.into()])
    }
}
impl RuleCollection for CalculusRules {
    fn get_rules() -> Vec<TokenParser> {
        vec![
            TokenParser::new(
                Self::rule_name("Infinity"),
                (None, None),
                StartingParser::from_characters(vec!['∞'], LeafNodeType::Symbol),
            ),
            TokenParser::new(
                Self::rule_name("Lim"),
                (None, None),
                StartingParser::from_characters(vec!['l', 'i', 'm'], LeafNodeType::Symbol),
            ),
            TokenParser::new(
                Self::rule_name("LimSup"),
                (None, None),
                StartingParser::from_characters(
                    vec!['l', 'i', 'm', 's', 'u', 'p'],
                    LeafNodeType::Symbol,
                ),
            ),
            TokenParser::new(
                Self::rule_name("LimInf"),
                (None, None),
                StartingParser::from_characters(
                    vec!['l', 'i', 'm', 'i', 'n', 'f'],
                    LeafNodeType::Symbol,
                ),
            ),
            // sum
            // integral
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![
            AutocompleteRule::new(InputNode::symbols(vec!["∞"]), "infinity"),
            AutocompleteRule::new(InputNode::symbols(vec!["l", "i", "m"]), "lim"),
            AutocompleteRule::new(
                InputNode::symbols(vec!["l", "i", "m", "s", "u", "p"]),
                "limsup",
            ),
            AutocompleteRule::new(
                InputNode::symbols(vec!["l", "i", "m", "i", "n", "f"]),
                "liminf",
            ),
        ]
    }
}
