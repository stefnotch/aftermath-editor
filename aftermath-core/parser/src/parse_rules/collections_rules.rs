use crate::{parse_rules::StartingTokenMatcher, syntax_tree::NodeIdentifier};

use super::{RuleCollection, TokenDefinition};

pub struct CollectionRules {}

impl CollectionRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Collection".into(), name.into()])
    }
}
impl RuleCollection for CollectionRules {
    fn get_rules() -> Vec<TokenDefinition> {
        vec![TokenDefinition::new(
            Self::rule_name("Tuple"),
            (Some(50), Some(51)),
            StartingTokenMatcher::operator_from_character(','),
        )]
    }

    fn get_autocomplete_rules() -> Vec<crate::AutocompleteRule> {
        vec![]
    }
}
