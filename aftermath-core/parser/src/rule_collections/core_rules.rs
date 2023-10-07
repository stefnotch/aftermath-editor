use crate::make_parser::{just_symbol_parser, make_brackets_parser, make_empty_brackets_parser};
use crate::parse_module::*;
use crate::parse_modules::ParseModules;

use crate::syntax_tree::{LeafNodeType, SyntaxNodeBuilder};
use crate::{autocomplete::AutocompleteRule, syntax_tree::PathIdentifier};
use chumsky::{prelude::*, Parser};

use input_tree::node::InputNode;
use unicode_ident::{is_xid_continue, is_xid_start};

use super::built_in_rules::BuiltInRules;

/// Core rules that one basically always wants.
pub struct CoreRules {
    module_name: String,
    rules: Vec<ParseRule>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl CoreRules {
    pub fn new(modules: &mut ParseModules, built_in_rules: &BuiltInRules) -> Self {
        let rules = Self::get_rules(modules, built_in_rules);
        let autocomplete_rules = Self::get_autocomplete_rules();
        Self {
            module_name: "Core".into(),
            rules,
            autocomplete_rules,
        }
    }
    fn rule_name(name: &str) -> PathIdentifier {
        PathIdentifier::new(vec!["Core".into(), name.into()])
    }
}
impl ParseModule for CoreRules {
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

fn is_identifier_start(value: &str) -> bool {
    let mut chars = value.chars();
    let matches = chars.next().map(is_xid_start).unwrap_or(false);
    matches && chars.all(is_xid_continue)
}

fn is_identifier_continue(value: &str) -> bool {
    value.chars().all(is_xid_continue)
}

impl CoreRules {
    fn get_rules(modules: &mut ParseModules, built_in_rules: &BuiltInRules) -> Vec<ParseRule> {
        vec![
            atom_rule(
                modules.with_rule_name(Self::rule_name("Variable")),
                crate::make_parser::MakeParserFn(|_| {
                    select! {
                      InputNode::Symbol(a) if is_identifier_start(&a) => a,
                    }
                    .then(
                        select! {
                          InputNode::Symbol(a) if is_identifier_continue(&a) => a,
                        }
                        .repeated()
                        .collect::<Vec<_>>(),
                    )
                    .map(|v| {
                        let mut symbols = vec![v.0];
                        symbols.extend(v.1);
                        SyntaxNodeBuilder::new_leaf_node(symbols, LeafNodeType::Symbol)
                    })
                    .boxed()
                }),
            ),
            // Amusingly, if someone defines the closing bracket as a postfix operator, it'll break the brackets
            // Brackets
            atom_rule(
                modules.with_rule_name(Self::rule_name("RoundBrackets")),
                make_brackets_parser(built_in_rules.operator_rule_name, "(", ")"),
            ),
            atom_rule(
                modules.with_rule_name(Self::rule_name("RoundBrackets")),
                make_empty_brackets_parser(built_in_rules.operator_rule_name, "(", ")"),
            ),
            recovery_ending_rule(just_symbol_parser(")")),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
