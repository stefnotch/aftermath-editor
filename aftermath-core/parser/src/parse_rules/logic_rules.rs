use crate::{
    parse_rules::StartingParser,
    syntax_tree::{LeafNodeType, NodeIdentifier},
    AutocompleteRule,
};

use super::{RuleCollection, TokenParser};

/// Rules for basic arithmetic.
pub struct LogicRules {}

impl LogicRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Logic".into(), name.into()])
    }
}
impl RuleCollection for LogicRules {
    fn get_rules() -> Vec<TokenParser> {
        vec![
            TokenParser::new(
                Self::rule_name("True"),
                (None, None),
                StartingParser::from_characters(vec!['⊤'], LeafNodeType::Symbol),
            ),
            TokenParser::new(
                Self::rule_name("False"),
                (None, None),
                StartingParser::from_characters(vec!['⊥'], LeafNodeType::Symbol),
            ),
            TokenParser::new(
                Self::rule_name("And"),
                (Some(100), Some(101)),
                StartingParser::operator_from_character('∧'),
            ),
            TokenParser::new(
                Self::rule_name("Or"),
                (Some(100), Some(101)),
                StartingParser::operator_from_character('∨'),
            ),
            TokenParser::new(
                Self::rule_name("Not"),
                (Some(100), Some(101)),
                StartingParser::operator_from_character('¬'),
            ),
            TokenParser::new(
                Self::rule_name("Equivalent"),
                (Some(100), Some(101)),
                StartingParser::operator_from_character('⇔'),
            ),
            TokenParser::new(
                Self::rule_name("Implies"),
                (Some(100), Some(101)),
                StartingParser::operator_from_character('⟹'),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
