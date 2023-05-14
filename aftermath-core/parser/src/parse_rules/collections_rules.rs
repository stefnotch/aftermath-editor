use crate::{
    nfa_builder::NFABuilder,
    parse_rules::{StartingTokenMatcher, TokenMatcher},
    syntax_tree::{LeafNodeType, NodeIdentifier},
};

use super::TokenDefinition;

pub struct CollectionsRules {}

impl CollectionsRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Collections".into(), name.into()])
    }

    pub fn get_rules() -> Vec<TokenDefinition> {
        vec![TokenDefinition::new(
            CollectionsRules::rule_name("Tuple"),
            (Some(50), Some(51)),
            StartingTokenMatcher::operator_from_character(','),
        )]
    }
}
