use input_tree::input_node::InputNode;

use crate::{
    nfa_builder::NFABuilder,
    parse_rules::{StartingTokenMatcher, TokenMatcher},
    syntax_tree::{LeafNodeType, NodeIdentifier},
    AutocompleteRule,
};

use super::{RuleCollection, TokenDefinition};

/// Rules for basic calculus.
pub struct CalculusRules {}

impl CalculusRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Calculus".into(), name.into()])
    }
}
impl RuleCollection for CalculusRules {
    fn get_rules() -> Vec<TokenDefinition> {
        vec![
            TokenDefinition::new(
                Self::rule_name("Infinity"),
                (None, None),
                StartingTokenMatcher::from_characters(vec!['∞'], LeafNodeType::Symbol),
            ),
            TokenDefinition::new(
                Self::rule_name("Lim"),
                (None, None),
                StartingTokenMatcher::from_characters(vec!['l', 'i', 'm'], LeafNodeType::Symbol),
            ),
            TokenDefinition::new(
                Self::rule_name("LimSup"),
                (None, None),
                StartingTokenMatcher::from_characters(
                    vec!['l', 'i', 'm', 's', 'u', 'p'],
                    LeafNodeType::Symbol,
                ),
            ),
            TokenDefinition::new(
                Self::rule_name("LimInf"),
                (None, None),
                StartingTokenMatcher::from_characters(
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
