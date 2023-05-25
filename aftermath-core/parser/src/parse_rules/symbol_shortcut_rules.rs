use std::ops::Range;

use input_tree::input_node::InputNodeType;

use crate::{
    nfa_builder::NFABuilder,
    parse_rules::{StartingTokenMatcher, TokenMatcher},
    syntax_tree::{LeafNodeType, NodeIdentifier},
    SyntaxLeafNode, SyntaxNode, SyntaxNodes,
};

use super::{ParseRuleCollection, TokenDefinition};

pub struct SymbolShortcutRules {}

impl SymbolShortcutRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["SymbolShortcut".into(), name.into()])
    }
}

impl ParseRuleCollection for SymbolShortcutRules {
    fn get_rules() -> Vec<TokenDefinition> {
        vec![
          TokenDefinition::new(
              ArithmeticRules::rule_name("Fraction"),
              (Some(200), Some(201)),
              StartingTokenMatcher::operator_from_character('/'),
          ),
          TokenDefinition::new(
              ArithmeticRules::rule_name("Sub"),
              (Some(850), None), // Dunno really
              StartingTokenMatcher::operator_from_character('_'),
          ),
          TokenDefinition::new(
              ArithmeticRules::rule_name("Sup"),
              (Some(850), None),
              StartingTokenMatcher::operator_from_character('^'),
          ),
        ]
    }
}
