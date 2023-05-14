use crate::{
    parse_rules::{ContainerType, StartingTokenMatcher},
    syntax_tree::NodeIdentifier,
};

use super::TokenDefinition;

pub struct BuiltInRules {}

impl BuiltInRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["BuiltIn".into(), name.into()])
    }

    /// A parse error.
    pub fn error_name() -> NodeIdentifier {
        BuiltInRules::rule_name("Error")
    }

    /// An empty node, this happens when a row is empty.
    pub fn nothing_name() -> NodeIdentifier {
        BuiltInRules::rule_name("Nothing")
    }

    /// An operator node, this is a node that can be skipped in an abstract syntax tree.
    pub fn operator_name() -> NodeIdentifier {
        BuiltInRules::rule_name("Operator")
    }

    pub fn get_rules() -> Vec<TokenDefinition> {
        vec![
            TokenDefinition::new(
                BuiltInRules::rule_name("Fraction"),
                (None, None),
                StartingTokenMatcher::Container(ContainerType::Fraction),
            ),
            TokenDefinition::new(
                BuiltInRules::rule_name("Root"),
                (None, None),
                StartingTokenMatcher::Container(ContainerType::Root),
            ),
        ]
    }
}
