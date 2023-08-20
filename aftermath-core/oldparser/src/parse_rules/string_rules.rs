use crate::{
    nfa_builder::NFABuilder,
    parse_rules::{StartingParser, TokenMatcher},
    syntax_tree::{LeafNodeType, NodeIdentifier},
    AutocompleteRule,
};

use super::{RuleCollection, TokenParser};

pub struct StringRules {}

impl StringRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["String".into(), name.into()])
    }
}
impl RuleCollection for StringRules {
    fn get_rules() -> Vec<TokenParser> {
        vec![TokenParser::new(
            Self::rule_name("String"),
            (None, None),
            // https://stackoverflow.com/questions/249791/regex-for-quoted-string-with-escaping-quotes
            /*
            flowchart LR
                A(Quote &quot) --> B(Epsilon)
                B --> C(Backslash \)
                C --> D(Any)
                D -->B
                B -->F(Final Quote &quot)
                B -->G(Other)
                G -->B
                */
            StartingParser::Token(TokenMatcher {
                symbol: NFABuilder::match_character(('"').into())
                    .then(
                        // Skip quote
                        NFABuilder::match_character(('\0'..='!').into())
                            .or(
                                // Skip backslash
                                NFABuilder::match_character(('#'..='[').into()),
                            )
                            .or(
                                // Rest of Unicode characters
                                NFABuilder::match_character((']'..=char::MAX).into()),
                            )
                            .or(NFABuilder::match_character('\\'.into())
                                .then_character(('\0'..=char::MAX).into()))
                            .zero_or_more(),
                    )
                    .then_character('"'.into())
                    .build(),
                symbol_type: LeafNodeType::Symbol,
            }),
        )]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
