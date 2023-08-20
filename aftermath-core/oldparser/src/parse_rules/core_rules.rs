use input_tree::{node::InputNode, row::InputRow};

use crate::{
    grapheme_matcher::GraphemeMatcher,
    nfa_builder::NFABuilder,
    parse_rules::{Argument, ArgumentParserType, StartingParser, TokenMatcher},
    syntax_tree::{LeafNodeType, NodeIdentifier},
    AutocompleteRule,
};

use super::{RuleCollection, TokenParser};

/// Core rules that one basically always wants.
pub struct CoreRules {}

impl CoreRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Core".into(), name.into()])
    }
}
impl RuleCollection for CoreRules {
    fn get_rules() -> Vec<TokenParser> {
        vec![
            // TODO: Good whitespace handling
            /*(
                TokenMatcher::Pattern( NFABuilder::match_character((' ').into()).build(),
            ),
                TokenDefinition::new(minimal_definitions.empty.clone(), (None, None)),
            ),*/
            TokenParser::new(
                Self::rule_name("Variable"),
                (None, None),
                StartingParser::Token(TokenMatcher {
                    symbol: NFABuilder::match_character(GraphemeMatcher::IdentifierStart)
                        .then(
                            NFABuilder::match_character(GraphemeMatcher::IdentifierContinue)
                                .zero_or_more(),
                        )
                        .build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            TokenParser::new(
                Self::rule_name("Subscript"),
                (Some(850), None), // Dunno really
                StartingParser::operator_from_character('_'),
            ),
            // Amusingly, if someone defines the closing bracket as a postfix operator, it'll break the brackets
            // Brackets

            // Unit tuple
            TokenParser::new(
                Self::rule_name("RoundBrackets"),
                (None, None),
                StartingParser::from_characters(vec!['(', ')'].into(), LeafNodeType::Operator),
            ),
            TokenParser::new(
                Self::rule_name("RoundBrackets"),
                (None, None),
                StartingParser::from_character('(', LeafNodeType::Operator),
            )
            .with_parsers(vec![
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
            ]),
        ]
    }

    fn get_autocomplete_rules() -> Vec<crate::AutocompleteRule> {
        vec![AutocompleteRule::new(
            vec![InputNode::sub(InputRow::default())],
            "_",
        )]
    }
}
