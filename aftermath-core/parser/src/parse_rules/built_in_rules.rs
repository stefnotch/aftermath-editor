use std::ops::Range;

use input_tree::input_node::{InputNode, InputNodeType};

use crate::{
    nfa_builder::NFABuilder,
    parse_rules::{StartingTokenMatcher, TokenMatcher},
    syntax_tree::{LeafNodeType, NodeIdentifier},
    SyntaxLeafNode, SyntaxNode, SyntaxNodes,
};

use super::{ParseRuleCollection, TokenDefinition};

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

    pub fn operator_node(leaf_node: SyntaxLeafNode) -> SyntaxNode {
        assert!(leaf_node.node_type == LeafNodeType::Operator);
        SyntaxNode::new(
            BuiltInRules::operator_name(),
            leaf_node.range(),
            SyntaxNodes::Leaves(vec![leaf_node]),
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

    pub fn fraction_rule_name() -> NodeIdentifier {
        BuiltInRules::rule_name("Fraction")
    }

    pub fn root_rule_name() -> NodeIdentifier {
        BuiltInRules::rule_name("Root")
    }

    pub fn under_rule_name() -> NodeIdentifier {
        BuiltInRules::rule_name("Under")
    }

    pub fn over_rule_name() -> NodeIdentifier {
        BuiltInRules::rule_name("Over")
    }

    pub fn row_rule_name() -> NodeIdentifier {
        BuiltInRules::rule_name("Row")
    }

    pub fn table_rule_name() -> NodeIdentifier {
        BuiltInRules::rule_name("Table")
    }
}

impl ParseRuleCollection for BuiltInRules {
    fn get_rules() -> Vec<TokenDefinition> {
        vec![
            // Matching those as *single* tokens is fine,
            //   since I think that AST transformations are about as powerful as typical parsing techniques.
            // So if we want something like a matrix surrounded with brackets,
            //   we just write the appropriate AST transformation.
            TokenDefinition::new(
                Self::rule_name("Fraction"),
                (None, None),
                StartingTokenMatcher::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeType::Fraction).build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            TokenDefinition::new(
                Self::rule_name("Root"),
                (None, None),
                StartingTokenMatcher::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeType::Root).build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            TokenDefinition::new(
                Self::rule_name("Under"),
                (None, None),
                StartingTokenMatcher::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeType::Under).build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            TokenDefinition::new(
                Self::rule_name("Over"),
                (None, None),
                StartingTokenMatcher::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeType::Over).build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            // Yay, thanks to the WYSIWYG editing model, I don't have to deal with "exponent associativity".
            // After all, it's clear if something is inside a superscript or not.
            TokenDefinition::new(
                Self::rule_name("Sup"),
                (Some(1000), None),
                StartingTokenMatcher::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeType::Sup).build(),
                    symbol_type: LeafNodeType::Operator,
                }),
            ),
            TokenDefinition::new(
                Self::rule_name("Sub"),
                (Some(1000), None),
                StartingTokenMatcher::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeType::Sub).build(),
                    symbol_type: LeafNodeType::Operator,
                }),
            ),
            // TODO: Table row_width
            TokenDefinition::new(
                Self::rule_name("Table"),
                (None, None),
                StartingTokenMatcher::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeType::Table).build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            // skip symbol
        ]
    }

    fn get_extra_rule_names() -> Vec<NodeIdentifier> {
        vec![
            Self::error_name(),
            Self::error_message_name(),
            Self::nothing_name(),
            Self::operator_name(),
        ]
    }
}
