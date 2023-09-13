use crate::make_parser::{just_operator_parser, just_symbol_parser};
use crate::parser_extensions::just_symbol;
use crate::rule_collection::{BoxedNodeParser, BoxedTokenParser};
use crate::{
    autocomplete::AutocompleteRule,
    rule_collection::{RuleCollection, TokenRule},
    syntax_tree::NodeIdentifier,
};
use chumsky::{prelude::*, Parser};
use input_tree::grid::Grid;
use input_tree::input_nodes;
use input_tree::node::{InputNode, InputNodeVariant};

pub struct CollectionsRules {}

impl CollectionsRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Collection".into(), name.into()])
    }
}
impl RuleCollection for CollectionsRules {
    fn get_rules() -> Vec<crate::rule_collection::TokenRule> {
        vec![TokenRule::new(
            Self::rule_name("Tuple"),
            (Some(50), Some(51)),
            just_operator_parser(','),
        )]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![
            AutocompleteRule::new("vector", input_nodes! {(table 1 x 1 (row))}),
            AutocompleteRule::new("matrix", input_nodes! {(table 1 x 1 (row))}),
        ]
    }
}
