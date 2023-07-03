use crate::{
    nfa_builder::NFABuilder,
    parse_rules::{Argument, ArgumentParserType, StartingTokenMatcher, TokenMatcher},
    syntax_tree::{LeafNodeType, NodeIdentifier},
    AutocompleteRule,
};

use super::{RuleCollection, TokenDefinition};

pub struct FunctionRules {}

impl FunctionRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Function".into(), name.into()])
    }
}
impl RuleCollection for FunctionRules {
    fn get_rules() -> Vec<TokenDefinition> {
        vec![TokenDefinition::new_with_parsers(
            Self::rule_name("FunctionApplication"),
            (Some(800), None),
            StartingTokenMatcher::operator_from_character('('),
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
        )]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
