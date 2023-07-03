use input_tree::input_node::InputNode;

use crate::{parse_rules::StartingTokenMatcher, syntax_tree::NodeIdentifier, AutocompleteRule};

use super::{RuleCollection, TokenDefinition};

/// Rules for basic comparisons.
pub struct ComparisonRules {}

impl ComparisonRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Comparison".into(), name.into()])
    }
}
impl RuleCollection for ComparisonRules {
    fn get_rules() -> Vec<TokenDefinition> {
        vec![
            TokenDefinition::new(
                Self::rule_name("Equals"),
                (Some(40), Some(41)),
                StartingTokenMatcher::operator_from_character('='),
            ),
            TokenDefinition::new(
                Self::rule_name("GreaterThan"),
                (Some(50), Some(51)),
                StartingTokenMatcher::operator_from_character('>'),
            ),
            TokenDefinition::new(
                Self::rule_name("LessThan"),
                (Some(50), Some(51)),
                StartingTokenMatcher::operator_from_character('<'),
            ),
            TokenDefinition::new(
                Self::rule_name("GreaterThanOrEquals"),
                (Some(50), Some(51)),
                StartingTokenMatcher::operator_from_character('≥'),
            ),
            TokenDefinition::new(
                Self::rule_name("LessThanOrEquals"),
                (Some(50), Some(51)),
                StartingTokenMatcher::operator_from_character('≤'),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![
            AutocompleteRule::new(InputNode::symbols(vec!["≥"]), ">="),
            AutocompleteRule::new(InputNode::symbols(vec!["≤"]), "<="),
        ]
    }
}
