use input_tree::{node::InputNode, row::InputRow};

use crate::{
    nfa_builder::NFABuilder,
    parse_rules::{StartingParser, TokenMatcher},
    syntax_tree::{LeafNodeType, NodeIdentifier},
    AutocompleteRule,
};

use super::{RuleCollection, TokenParser};

/// Rules for basic arithmetic.
pub struct ArithmeticRules {}

impl ArithmeticRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Arithmetic".into(), name.into()])
    }
}
impl RuleCollection for ArithmeticRules {
    fn get_rules() -> Vec<TokenParser> {
        vec![
            TokenParser::new(
                Self::rule_name("Number"),
                (None, None),
                StartingParser::Token(TokenMatcher {
                    symbol: NFABuilder::match_character(('0'..='9').into())
                        .one_or_more()
                        .then(
                            NFABuilder::match_character('.'.into())
                                .then(NFABuilder::match_character(('0'..='9').into()).one_or_more())
                                .optional(),
                        )
                        .build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            TokenParser::new(
                Self::rule_name("Add"),
                (Some(100), Some(101)),
                StartingParser::operator_from_character('+'),
            ),
            TokenParser::new(
                Self::rule_name("Subtract"),
                (Some(100), Some(101)),
                StartingParser::operator_from_character('-'),
            ),
            TokenParser::new(
                Self::rule_name("Add"),
                (None, Some(400)),
                StartingParser::operator_from_character('+'),
            ),
            TokenParser::new(
                Self::rule_name("Subtract"),
                (None, Some(400)),
                StartingParser::operator_from_character('-'),
            ),
            TokenParser::new(
                Self::rule_name("Multiply"),
                (Some(200), Some(201)),
                StartingParser::operator_from_character('*'),
            ),
            TokenParser::new(
                Self::rule_name("Divide"),
                (Some(200), Some(201)),
                StartingParser::operator_from_character('/'),
            ),
            TokenParser::new(
                Self::rule_name("Exponent"),
                (Some(850), None),
                StartingParser::operator_from_character('^'),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![
            AutocompleteRule::new(
                vec![InputNode::fraction([
                    InputRow::default(),
                    InputRow::default(),
                ])],
                "/",
            ),
            AutocompleteRule::new(
                vec![InputNode::root([Default::default(), Default::default()])],
                "sqrt",
            ),
            AutocompleteRule::new(vec![InputNode::sup(Default::default())], "^"),
        ]
    }
}
