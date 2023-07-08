use crate::{
    nfa_builder::NFABuilder,
    parse_rules::{Argument, ArgumentParserType, StartingParser, TokenMatcher},
    syntax_tree::{LeafNodeType, NodeIdentifier},
    AutocompleteRule,
};

use super::{RuleCollection, TokenParser};

pub struct FunctionRules {}

impl FunctionRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Function".into(), name.into()])
    }
}
impl RuleCollection for FunctionRules {
    fn get_rules() -> Vec<TokenParser> {
        vec![TokenParser::new(
            Self::rule_name("FunctionApplication"),
            (Some(800), None),
            StartingParser::operator_from_character('('),
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
        ])]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
