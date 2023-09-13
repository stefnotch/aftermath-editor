use std::ops::Range;

use crate::make_parser::just_symbol_parser;
use crate::parser_extensions::just_symbol;
use crate::rule_collection::{BoxedNodeParser, BoxedTokenParser};
use crate::rule_collections::core_rules::CoreRules;
use crate::syntax_tree::{
    LeafNodeType, SyntaxLeafNode, SyntaxNode, SyntaxNodeBuilder, SyntaxNodeChildren,
};
use crate::{
    autocomplete::AutocompleteRule,
    rule_collection::{RuleCollection, TokenRule},
    syntax_tree::NodeIdentifier,
};
use chumsky::{prelude::*, Parser};
use input_tree::grid::Grid;
use input_tree::input_nodes;
use input_tree::node::{InputNode, InputNodeVariant};
pub struct FunctionRules {}

impl FunctionRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Function".into(), name.into()])
    }
}
impl RuleCollection for FunctionRules {
    fn get_rules() -> Vec<TokenRule> {
        vec![TokenRule::new(
            Self::rule_name("FunctionApplication"),
            (Some(800), None),
            CoreRules::make_brackets_parser(),
        )]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
