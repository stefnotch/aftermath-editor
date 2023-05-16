use std::ops::Range;

use input_tree::input_node::InputNode;

use crate::{syntax_tree::NodeIdentifier, SyntaxLeafNode, SyntaxNode, SyntaxNodes};

use super::TokenDefinition;

pub struct BuiltInRules {}

impl BuiltInRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["BuiltIn".into(), name.into()])
    }

    /// A parse error.
    fn error_name() -> NodeIdentifier {
        BuiltInRules::rule_name("Error")
    }

    /// A error message.
    fn error_message_name() -> NodeIdentifier {
        BuiltInRules::rule_name("ErrorMessage")
    }

    pub fn parse_error_node(range: Range<usize>, children: Vec<SyntaxNode>) -> SyntaxNode {
        SyntaxNode::new(
            BuiltInRules::error_name(),
            range,
            SyntaxNodes::Containers(children),
        )
    }

    pub fn error_message_node(range: Range<usize>, children: Vec<SyntaxLeafNode>) -> SyntaxNode {
        SyntaxNode::new(
            BuiltInRules::error_message_name(),
            range,
            SyntaxNodes::Leaves(children),
        )
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
        vec![]
    }

    pub fn get_new_row_token_name(next_token: &InputNode) -> NodeIdentifier {
        match next_token {
            InputNode::Fraction(_) => BuiltInRules::rule_name("Fraction"),
            InputNode::Root(_) => BuiltInRules::rule_name("Root"),
            InputNode::Under(_) => BuiltInRules::rule_name("Under"),
            InputNode::Over(_) => BuiltInRules::rule_name("Over"),
            InputNode::Sup(_) => BuiltInRules::rule_name("Sup"),
            InputNode::Sub(_) => BuiltInRules::rule_name("Sub"),
            InputNode::Table { .. } => BuiltInRules::rule_name("Table"),
            InputNode::Symbol(_) => BuiltInRules::rule_name("Symbol"),
        }
    }
}
