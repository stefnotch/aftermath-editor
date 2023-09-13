use std::ops::Range;

use crate::make_parser::just_symbol_parser;
use crate::parser_extensions::just_symbol;
use crate::rule_collection::{BoxedNodeParser, BoxedTokenParser};
use crate::syntax_tree::{
    LeafNodeType, SyntaxLeafNode, SyntaxNode, SyntaxNodeBuilder, SyntaxNodeChildren,
};
use crate::{
    autocomplete::AutocompleteRule,
    rule_collection::{RuleCollection, TokenRule},
    syntax_tree::NodeIdentifier,
};
use chumsky::{prelude::*, Parser};
use input_tree::grid::Grid;
use input_tree::input_nodes;
use input_tree::node::{InputNode, InputNodeVariant};

pub struct BuiltInRules;

impl BuiltInRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["BuiltIn".into(), name.into()])
    }
    fn error_rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Error".into(), name.into()])
    }

    fn error_missing_operator_name() -> NodeIdentifier {
        BuiltInRules::error_rule_name("MissingOperator")
    }

    fn error_missing_token_name() -> NodeIdentifier {
        BuiltInRules::error_rule_name("MissingToken")
    }

    /// Either an operator or an operand token is missing.
    pub fn error_missing_token(range: Range<usize>) -> SyntaxNode {
        assert!(range.is_empty());
        SyntaxNode::new(
            BuiltInRules::error_missing_token_name(),
            range,
            SyntaxNodeChildren::Children(vec![]),
        )
    }

    pub fn error_missing_operator(
        range: Range<usize>,
        child_a: SyntaxNode,
        child_b: SyntaxNode,
    ) -> SyntaxNode {
        let missing_operator_node =
            BuiltInRules::error_missing_token(child_a.range().end..child_b.range().start);
        SyntaxNode::new(
            BuiltInRules::error_missing_operator_name(),
            range,
            SyntaxNodeChildren::Children(vec![child_a, missing_operator_node, child_b]),
        )
    }

    fn error_unknown_token_name() -> NodeIdentifier {
        BuiltInRules::error_rule_name("UnknownToken")
    }

    // pub fn error_unknown_next_token(
    //     range: Range<usize>,
    //     child_a: SyntaxNode,
    //     unknown_token: SyntaxLeafNode,
    // ) -> SyntaxNode {
    //     let children: Vec<SyntaxNode> = vec![
    //         child_a,
    //         SyntaxNode::new(
    //             BuiltInRules::error_unknown_token_name(),
    //             unknown_token.range(),
    //             SyntaxNodeChildren::Leaf(unknown_token),
    //         ),
    //     ];
    //     BuiltInRules::error_container_node(range, children)
    // }

    /// An empty node, this happens when a row is empty.
    fn nothing_name() -> NodeIdentifier {
        BuiltInRules::rule_name("Nothing")
    }

    pub fn nothing_node(range: Range<usize>) -> SyntaxNode {
        assert!(range.is_empty());
        SyntaxNode::new(
            BuiltInRules::nothing_name(),
            range,
            SyntaxNodeChildren::Children(vec![]),
        )
    }

    fn make_container_parser(
        container_type: InputNodeVariant,
    ) -> impl crate::make_parser::MakeParser {
        crate::make_parser::MakeParserFn(move |parser| {
            select_ref! {
              InputNode::Container(c_type, a) if c_type == &container_type => a,
            }
            .map(move |v| {
                let new_grid = Grid::from_one_dimensional(
                    v.values()
                        .into_iter()
                        .map(|row| {
                            let parsed = parser.parse(&row.values);
                            let (output, errors) = parsed.into_output_errors();
                            let output = output.unwrap_or_else(|| Self::nothing_node(0..0));
                            // TODO: This should never happen
                            if errors.len() > 0 {
                                println!("Errors: {:?}", errors);
                            }
                            output
                        })
                        .collect(),
                    v.width(),
                );
                SyntaxNodeBuilder::new(SyntaxNodeChildren::NewRows(new_grid))
            })
            .boxed()
        })
    }
}

impl RuleCollection for BuiltInRules {
    fn get_rules() -> Vec<crate::rule_collection::TokenRule> {
        vec![
            TokenRule::new(
                Self::rule_name("Fraction"),
                (None, None),
                BuiltInRules::make_container_parser(InputNodeVariant::Fraction),
            ),
            TokenRule::new(
                Self::rule_name("Root"),
                (None, None),
                BuiltInRules::make_container_parser(InputNodeVariant::Root),
            ),
            // Yay, thanks to the WYSIWYG editing model, I don't have to deal with "exponent associativity".
            // After all, it's clear if something is inside a superscript or not.
            TokenRule::new(
                Self::rule_name("Sup"),
                (Some(1000), None),
                BuiltInRules::make_container_parser(InputNodeVariant::Sup),
            ),
            TokenRule::new(
                Self::rule_name("Sub"),
                (Some(1000), None),
                BuiltInRules::make_container_parser(InputNodeVariant::Sub),
            ),
            TokenRule::new(
                Self::rule_name("Table"),
                (None, None),
                BuiltInRules::make_container_parser(InputNodeVariant::Table),
            ),
        ]
    }

    fn get_extra_rule_names() -> Vec<NodeIdentifier> {
        // TODO: Remove most of those
        vec![
            Self::error_missing_operator_name(),
            Self::error_unknown_token_name(),
            Self::error_missing_token_name(),
            Self::nothing_name(),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![
            AutocompleteRule::new("^", input_nodes! {(sup (row))}),
            AutocompleteRule::new("_", input_nodes! {(sub (row))}),
        ]
    }
}