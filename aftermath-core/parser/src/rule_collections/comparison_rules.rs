use std::ops::Range;

use crate::make_parser::{just_operator_parser, just_symbol_parser};
use crate::parser_extensions::just_symbol;
use crate::rule_collection::{BoxedNodeParser, BoxedTokenParser};
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

/// Rules for basic comparisons.
/// Chains of < <= can be treated as "domain restrictions".
pub struct ComparisonRules {}

impl ComparisonRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Comparison".into(), name.into()])
    }
}
impl RuleCollection for ComparisonRules {
    fn get_rules() -> Vec<TokenRule> {
        vec![
            TokenRule::new(
                Self::rule_name("Equals"),
                (Some(40), Some(41)),
                just_operator_parser('='),
            ),
            TokenRule::new(
                Self::rule_name("GreaterThan"),
                (Some(50), Some(51)),
                just_operator_parser('>'),
            ),
            TokenRule::new(
                Self::rule_name("LessThan"),
                (Some(50), Some(51)),
                just_operator_parser('<'),
            ),
            TokenRule::new(
                Self::rule_name("GreaterThanOrEquals"),
                (Some(50), Some(51)),
                just_operator_parser('≥'),
            ),
            TokenRule::new(
                Self::rule_name("LessThanOrEquals"),
                (Some(50), Some(51)),
                just_operator_parser('≤'),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![
            AutocompleteRule::new(">=", input_nodes! {"≥"}),
            AutocompleteRule::new("<=", input_nodes! {"≤"}),
        ]
    }
}