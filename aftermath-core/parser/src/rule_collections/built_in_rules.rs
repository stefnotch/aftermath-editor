use std::ops::Range;

use crate::parse_module::*;
use crate::parse_modules::ParseModules;
use crate::parser::pratt_parser::{call_pratt_parser, Strength};
use crate::rule_collection::BoxedNodeParser;
use crate::syntax_tree::{
    LeafNodeType, SyntaxLeafNode, SyntaxNode, SyntaxNodeBuilder, SyntaxNodeChildren,
    SyntaxNodeNameId,
};
use crate::{autocomplete::AutocompleteRule, syntax_tree::PathIdentifier};
use chumsky::{prelude::*, Parser};
use input_tree::grid::{Grid, GridVec};
use input_tree::input_nodes;
use input_tree::node::{InputNode, InputNodeVariant};

pub struct BuiltInRules {
    module_name: String,
    rules: Vec<ParseRule>,
    autocomplete_rules: Vec<AutocompleteRule>,
    /// Whenever a syntax tree has an operator, this can be used to wrap the operator leaf.
    /// Do note that some operators are relevant for the AST, such as a "function call" being an operator with arguments.
    pub operator_rule_name: SyntaxNodeNameId,
    /// Can have Whitespace nodes at the start and/or end.
    whitespaces_rule_name: SyntaxNodeNameId,
    /// Whenever we encounter a space between tokens, this will be used.
    whitespace_rule_name: SyntaxNodeNameId,
    /// Whenever we encounter a subscript after an operator, this will be used.
    pub sub_rule_name: SyntaxNodeNameId,
    /// Whenever we encounter a superscript after an operator, this will be used.
    pub sup_rule_name: SyntaxNodeNameId,
    error_missing_operator_name: SyntaxNodeNameId,
    error_missing_token_name: SyntaxNodeNameId,
    error_unknown_token_name: SyntaxNodeNameId,
    /// An empty node, this happens when a row is empty.
    nothing_name: SyntaxNodeNameId,
}

impl BuiltInRules {
    pub fn new(modules: &mut ParseModules) -> Self {
        let operator_rule_name = modules.with_rule_name(BuiltInRules::rule_name("Operator"));
        let whitespaces_rule_name = modules.with_rule_name(BuiltInRules::rule_name("Whitespaces"));
        let whitespace_rule_name = modules.with_rule_name(BuiltInRules::rule_name("Whitespace"));
        let sub_rule_name = modules.with_rule_name(BuiltInRules::rule_name("Sub"));
        let sup_rule_name = modules.with_rule_name(BuiltInRules::rule_name("Sup"));
        let error_missing_operator_name =
            modules.with_rule_name(BuiltInRules::error_rule_name("MissingOperator"));
        let error_missing_token_name =
            modules.with_rule_name(BuiltInRules::error_rule_name("MissingToken"));
        let error_unknown_token_name =
            modules.with_rule_name(BuiltInRules::error_rule_name("UnknownToken"));
        let nothing_name = modules.with_rule_name(BuiltInRules::rule_name("Nothing"));

        let rules = vec![];
        let autocomplete_rules = Self::get_autocomplete_rules();
        let mut self_obj = Self {
            module_name: "BuiltIn".into(),
            rules,
            autocomplete_rules,
            operator_rule_name,
            whitespaces_rule_name,
            whitespace_rule_name,
            sub_rule_name,
            sup_rule_name,
            error_missing_operator_name,
            error_missing_token_name,
            error_unknown_token_name,
            nothing_name,
        };

        self_obj.rules = self_obj.make_rules(modules);

        self_obj
    }
    fn rule_name(name: &str) -> PathIdentifier {
        PathIdentifier::new(vec!["BuiltIn".into(), name.into()])
    }
    fn error_rule_name(name: &str) -> PathIdentifier {
        PathIdentifier::new(vec!["Error".into(), name.into()])
    }
}

impl ParseModule for BuiltInRules {
    fn get_module_name(&self) -> &str {
        &self.module_name
    }

    fn get_rules(&self) -> &[ParseRule] {
        &self.rules
    }

    fn get_autocomplete_rules(&self) -> &[AutocompleteRule] {
        &self.autocomplete_rules
    }
}

impl BuiltInRules {
    /// Either an operator or an operand token is missing.
    pub fn error_missing_token(&self, position: usize) -> SyntaxNode {
        SyntaxNode::new(
            self.error_missing_token_name,
            position..position,
            SyntaxNodeChildren::Children(vec![]),
        )
    }

    pub fn error_missing_operator(
        &self,
        range: Range<usize>,
        child_a: SyntaxNode,
        child_b: SyntaxNode,
    ) -> SyntaxNode {
        let missing_operator_node = self.error_missing_token(child_a.range().end);
        SyntaxNode::new(
            self.error_missing_operator_name,
            range,
            SyntaxNodeChildren::Children(vec![child_a, missing_operator_node, child_b]),
        )
    }

    pub fn error_unknown_token(&self, range: Range<usize>, values: &[InputNode]) -> SyntaxNode {
        SyntaxNode::new(
            self.error_unknown_token_name,
            range,
            SyntaxNodeChildren::Leaf(SyntaxLeafNode::new(
                crate::syntax_tree::LeafNodeType::Symbol,
                values
                    .iter()
                    .map(|v| match v {
                        InputNode::Symbol(v) => v.clone(),
                        _ => panic!("Expected symbol"),
                    })
                    .collect::<Vec<_>>(),
            )),
        )
    }

    pub fn nothing_node(&self, position: usize) -> SyntaxNode {
        Self::nothing_node_with_name(self.nothing_name, position)
    }

    pub fn whitespace_node(&self, symbols: Vec<String>, range: Range<usize>) -> SyntaxNode {
        SyntaxNodeBuilder::new_leaf_node(symbols, LeafNodeType::Operator)
            .build(self.whitespace_rule_name, range)
    }

    pub fn whitespaces_node(
        &self,
        spaces_before: Option<SyntaxNode>,
        node: SyntaxNode,
        spaces_after: Option<SyntaxNode>,
        range: Range<usize>,
    ) -> SyntaxNode {
        match (spaces_before, spaces_after) {
            (Some(spaces_before), Some(spaces_after)) => SyntaxNode::new(
                self.whitespaces_rule_name,
                range,
                SyntaxNodeChildren::Children(vec![spaces_before, node, spaces_after]),
            ),
            (None, Some(spaces_after)) => SyntaxNode::new(
                self.whitespaces_rule_name,
                range,
                SyntaxNodeChildren::Children(vec![node, spaces_after]),
            ),
            (Some(spaces_before), None) => SyntaxNode::new(
                self.whitespaces_rule_name,
                range,
                SyntaxNodeChildren::Children(vec![spaces_before, node]),
            ),
            (None, None) => node,
        }
    }

    fn nothing_node_with_name(name: SyntaxNodeNameId, position: usize) -> SyntaxNode {
        SyntaxNode::new(
            name,
            position..position,
            SyntaxNodeChildren::Children(vec![]),
        )
    }

    pub fn make_container_parser(
        &self,
        container_type: InputNodeVariant,
    ) -> impl crate::make_parser::MakeParser {
        let nothing_node_name = self.nothing_name.clone();
        crate::make_parser::MakeParserFn(move |parser| {
            let nothing_node_name = nothing_node_name.clone();
            select_ref! {
              InputNode::Container(c_type, a) if c_type == &container_type => a,
            }
            .map(move |v| {
                let new_grid = GridVec::from_one_dimensional(
                    v.values()
                        .map(|row| {
                            let p: BoxedNodeParser =
                                call_pratt_parser(parser.clone(), (0, Strength::Weak), None)
                                    .boxed();
                            let parsed = p.parse(&row.values);
                            let (output, errors) = parsed.into_output_errors();
                            let output = output.unwrap_or_else(|| {
                                Self::nothing_node_with_name(nothing_node_name.clone(), 0)
                            });
                            // TODO: This should never happen
                            if !errors.is_empty() {
                                panic!("Errors: {:?}", errors);
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
    fn make_rules(&self, modules: &mut ParseModules) -> Vec<ParseRule> {
        vec![
            name_only_rule(self.operator_rule_name),
            name_only_rule(self.whitespaces_rule_name),
            name_only_rule(self.whitespace_rule_name),
            name_only_rule(self.error_missing_operator_name),
            name_only_rule(self.error_unknown_token_name),
            name_only_rule(self.error_missing_token_name),
            name_only_rule(self.nothing_name),
            atom_rule(
                modules.with_rule_name(Self::rule_name("Fraction")),
                self.make_container_parser(InputNodeVariant::Fraction),
            ),
            atom_rule(
                modules.with_rule_name(Self::rule_name("Root")),
                self.make_container_parser(InputNodeVariant::Root),
            ),
            // Yay, thanks to the WYSIWYG editing model, I don't have to deal with "exponent associativity".
            // After all, it's clear if something is inside a superscript or not.
            postfix_rule(
                self.sup_rule_name,
                1000,
                self.make_container_parser(InputNodeVariant::Sup),
            ),
            postfix_rule(
                self.sub_rule_name,
                1000,
                self.make_container_parser(InputNodeVariant::Sub),
            ),
            atom_rule(
                modules.with_rule_name(Self::rule_name("Table")),
                self.make_container_parser(InputNodeVariant::Table),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![
            AutocompleteRule::new("^", input_nodes! {(sup (row))}),
            AutocompleteRule::new("_", input_nodes! {(sub (row))}),
        ]
    }
}
