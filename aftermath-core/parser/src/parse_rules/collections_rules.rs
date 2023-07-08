use crate::{parse_rules::StartingParser, syntax_tree::NodeIdentifier};

use super::{RuleCollection, TokenParser};

pub struct CollectionRules {}

impl CollectionRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Collection".into(), name.into()])
    }
}
impl RuleCollection for CollectionRules {
    fn get_rules() -> Vec<TokenParser> {
        vec![TokenParser::new(
            Self::rule_name("Tuple"),
            (Some(50), Some(51)),
            StartingParser::operator_from_character(','),
        )]
    }

    fn get_autocomplete_rules() -> Vec<crate::AutocompleteRule> {
        vec![]
    }
}
