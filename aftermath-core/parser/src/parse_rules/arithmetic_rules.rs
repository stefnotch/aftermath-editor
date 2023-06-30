use crate::{
    nfa_builder::NFABuilder,
    parse_rules::{StartingTokenMatcher, TokenMatcher},
    syntax_tree::{LeafNodeType, NodeIdentifier},
};

use super::TokenDefinition;

/// Rules for basic arithmetic.
pub struct ArithmeticRules {}

impl ArithmeticRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Arithmetic".into(), name.into()])
    }

    pub fn get_rules() -> Vec<TokenDefinition> {
        vec![
            TokenDefinition::new(
                ArithmeticRules::rule_name("Number"),
                (None, None),
                StartingTokenMatcher::Token(TokenMatcher {
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
            TokenDefinition::new(
                ArithmeticRules::rule_name("Add"),
                (Some(100), Some(101)),
                StartingTokenMatcher::operator_from_character('+'),
            ),
            TokenDefinition::new(
                ArithmeticRules::rule_name("Subtract"),
                (Some(100), Some(101)),
                StartingTokenMatcher::operator_from_character('-'),
            ),
            TokenDefinition::new(
                ArithmeticRules::rule_name("Add"),
                (None, Some(400)),
                StartingTokenMatcher::operator_from_character('+'),
            ),
            TokenDefinition::new(
                ArithmeticRules::rule_name("Subtract"),
                (None, Some(400)),
                StartingTokenMatcher::operator_from_character('-'),
            ),
            TokenDefinition::new(
                ArithmeticRules::rule_name("Multiply"),
                (Some(200), Some(201)),
                StartingTokenMatcher::operator_from_character('*'),
            ),
            TokenDefinition::new(
                ArithmeticRules::rule_name("Divide"),
                (Some(200), Some(201)),
                StartingTokenMatcher::operator_from_character('/'),
            ),
            TokenDefinition::new(
                ArithmeticRules::rule_name("Exponent"),
                (Some(850), None),
                StartingTokenMatcher::operator_from_character('^'),
            ),
        ]
    }
}
