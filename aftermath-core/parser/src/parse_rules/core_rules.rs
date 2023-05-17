use crate::{
    grapheme_matcher::GraphemeMatcher,
    nfa_builder::NFABuilder,
    parse_rules::{Argument, ArgumentParserType, StartingTokenMatcher, TokenMatcher},
    syntax_tree::{LeafNodeType, NodeIdentifier},
};

use super::TokenDefinition;

/// Core rules that one basically always wants.
pub struct CoreRules {}

impl CoreRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Core".into(), name.into()])
    }

    pub fn get_rules() -> Vec<TokenDefinition> {
        vec![
            // TODO: Good whitespace handling
            /*(
                TokenMatcher::Pattern( NFABuilder::match_character((' ').into()).build(),
            ),
                TokenDefinition::new(minimal_definitions.empty.clone(), (None, None)),
            ),*/
            TokenDefinition::new(
                CoreRules::rule_name("Variable"),
                (None, None),
                StartingTokenMatcher::Token(TokenMatcher {
                    symbol: NFABuilder::match_character(GraphemeMatcher::IdentifierStart)
                        .then(
                            NFABuilder::match_character(GraphemeMatcher::IdentifierContinue)
                                .zero_or_more(),
                        )
                        .build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            // Amusingly, if someone defines the closing bracket as a postfix operator, it'll break the brackets
            // Brackets

            // Unit tuple
            TokenDefinition::new(
                CoreRules::rule_name("RoundBrackets"),
                (None, None),
                StartingTokenMatcher::from_characters(
                    vec!['(', ')'].into(),
                    LeafNodeType::Operator,
                ),
            ),
            TokenDefinition::new_with_parsers(
                CoreRules::rule_name("RoundBrackets"),
                (None, None),
                StartingTokenMatcher::from_character('(', LeafNodeType::Operator),
                vec![
                    Argument {
                        parser: ArgumentParserType::Next {
                            minimum_binding_power: 0,
                        },
                    },
                    Argument {
                        parser: ArgumentParserType::NextToken(TokenMatcher {
                            symbol: NFABuilder::match_character(')'.into()).build(),
                            symbol_type: LeafNodeType::Operator,
                        }),
                    },
                ],
            ),
        ]
    }
}
