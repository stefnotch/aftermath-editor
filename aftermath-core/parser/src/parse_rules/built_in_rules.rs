use std::ops::Range;

use input_tree::input_node::InputNodeVariant;

use crate::{
    nfa_builder::NFABuilder,
    parse_rules::{StartingParser, TokenMatcher},
    syntax_tree::{LeafNodeType, NodeIdentifier},
    AutocompleteRule, SyntaxLeafNode, SyntaxNode, SyntaxTree,
};

use super::{RuleCollection, TokenParser};

pub struct BuiltInRules {}

impl BuiltInRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["BuiltIn".into(), name.into()])
    }

    /// An error is somewhere inside of this.
    fn error_container_name() -> NodeIdentifier {
        BuiltInRules::rule_name("ErrorContainer")
    }

    pub fn error_container_node(range: Range<usize>, children: Vec<SyntaxNode>) -> SyntaxNode {
        SyntaxNode::new(
            BuiltInRules::error_container_name(),
            range,
            SyntaxTree::Children(children),
        )
    }

    pub fn error_missing_operator(
        range: Range<usize>,
        child_a: SyntaxNode,
        child_b: SyntaxNode,
    ) -> SyntaxNode {
        let missing_operator_node =
            BuiltInRules::error_missing_token(child_a.range().end..child_b.range().start);
        BuiltInRules::error_container_node(range, vec![child_a, missing_operator_node, child_b])
    }

    fn error_unknown_token_name() -> NodeIdentifier {
        BuiltInRules::rule_name("ErrorUnknownToken")
    }

    pub fn error_unknown_next_token(
        range: Range<usize>,
        child_a: SyntaxNode,
        unknown_token: SyntaxLeafNode,
    ) -> SyntaxNode {
        let children: Vec<SyntaxNode> = vec![
            child_a,
            SyntaxNode::new(
                BuiltInRules::error_unknown_token_name(),
                unknown_token.range(),
                SyntaxTree::Leaf(unknown_token),
            ),
        ];
        BuiltInRules::error_container_node(range, children)
    }

    fn error_missing_token_name() -> NodeIdentifier {
        BuiltInRules::rule_name("ErrorMissingToken")
    }

    /// Either an operator or an operand token is missing.
    pub fn error_missing_token(range: Range<usize>) -> SyntaxNode {
        assert!(range.is_empty());
        SyntaxNode::new(
            BuiltInRules::error_missing_token_name(),
            range,
            SyntaxTree::Children(vec![]),
        )
    }

    pub fn operator_node(leaf_node: SyntaxLeafNode) -> SyntaxNode {
        assert!(leaf_node.node_type == LeafNodeType::Operator);
        SyntaxNode::new(
            BuiltInRules::operator_name(),
            leaf_node.range(),
            SyntaxTree::Leaf(leaf_node),
        )
    }

    /// An empty node, this happens when a row is empty.
    fn nothing_name() -> NodeIdentifier {
        BuiltInRules::rule_name("Nothing")
    }

    pub fn nothing_node(range: Range<usize>) -> SyntaxNode {
        assert!(range.is_empty());
        SyntaxNode::new(
            BuiltInRules::nothing_name(),
            range,
            SyntaxTree::Children(vec![]),
        )
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

impl RuleCollection for BuiltInRules {
    fn get_rules() -> Vec<TokenParser> {
        vec![
            // Matching those as *single* tokens is fine,
            //   since I think that AST transformations are about as powerful as typical parsing techniques.
            // So if we want something like a matrix surrounded with brackets,
            //   we just write the appropriate AST transformation.
            TokenParser::new(
                Self::rule_name("Fraction"),
                (None, None),
                StartingParser::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeVariant::Fraction).build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            TokenParser::new(
                Self::rule_name("Root"),
                (None, None),
                StartingParser::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeVariant::Root).build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            TokenParser::new(
                Self::rule_name("Under"),
                (None, None),
                StartingParser::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeVariant::Under).build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            TokenParser::new(
                Self::rule_name("Over"),
                (None, None),
                StartingParser::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeVariant::Over).build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            // Yay, thanks to the WYSIWYG editing model, I don't have to deal with "exponent associativity".
            // After all, it's clear if something is inside a superscript or not.
            TokenParser::new(
                Self::rule_name("Sup"),
                (Some(1000), None),
                StartingParser::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeVariant::Sup).build(),
                    symbol_type: LeafNodeType::Operator,
                }),
            ),
            TokenParser::new(
                Self::rule_name("Sub"),
                (Some(1000), None),
                StartingParser::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeVariant::Sub).build(),
                    symbol_type: LeafNodeType::Operator,
                }),
            ),
            // TODO: Table row_width
            TokenParser::new(
                Self::rule_name("Table"),
                (None, None),
                StartingParser::Token(TokenMatcher {
                    symbol: NFABuilder::match_input_node(InputNodeVariant::Table).build(),
                    symbol_type: LeafNodeType::Symbol,
                }),
            ),
            // skip symbol
        ]
    }

    fn get_extra_rule_names() -> Vec<NodeIdentifier> {
        vec![
            Self::error_container_name(),
            Self::error_unknown_token_name(),
            Self::error_missing_token_name(),
            Self::nothing_name(),
            Self::operator_name(),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
