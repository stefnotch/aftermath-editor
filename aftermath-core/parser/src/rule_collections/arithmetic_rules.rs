use crate::make_parser::just_operator_parser;
use crate::parse_module::*;
use crate::parse_modules::ParseModules;
use crate::parser_extensions::just_symbol;
use crate::syntax_tree::{LeafNodeType, SyntaxNodeBuilder};
use crate::{autocomplete::AutocompleteRule, syntax_tree::PathIdentifier};
use chumsky::{prelude::*, Parser};
use input_tree::input_nodes;
use input_tree::node::InputNode;

/// Rules for basic arithmetic.
pub struct ArithmeticRules {
    module_name: String,
    rules: Vec<ParseRule>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl ArithmeticRules {
    pub fn new(modules: &mut ParseModules) -> Self {
        let rules = Self::get_rules(modules);
        let autocomplete_rules = Self::get_autocomplete_rules();
        Self {
            module_name: "Arithmetic".into(),
            rules,
            autocomplete_rules,
        }
    }
    fn rule_name(name: &str) -> PathIdentifier {
        PathIdentifier::new(vec!["Arithmetic".into(), name.into()])
    }
}

impl ParseModule for ArithmeticRules {
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

impl ArithmeticRules {
    fn get_rules(modules: &mut ParseModules) -> Vec<ParseRule> {
        vec![
            atom_rule(
                modules.with_rule_name(Self::rule_name("Number")),
                crate::make_parser::MakeParserFn(|_| {
                    let digits = select! {
                      InputNode::Symbol(a) if a.chars().all(|v| v.is_ascii_digit()) => a,
                    }
                    .repeated()
                    .at_least(1)
                    .collect::<Vec<_>>();

                    digits
                        .then(just_symbol(".").then(digits).or_not())
                        .map(|(mut a, b)| {
                            if let Some((c, d)) = b {
                                a.push(c);
                                a.extend(d);
                            }
                            a
                        })
                        .map(|v| SyntaxNodeBuilder::new_leaf_node(v, LeafNodeType::Symbol))
                        .boxed()
                }),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("Add")),
                100,
                just_operator_parser("+"),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("Subtract")),
                100,
                just_operator_parser("-"),
            ),
            prefix_rule(
                modules.with_rule_name(Self::rule_name("Add")),
                400,
                just_operator_parser("+"),
            ),
            prefix_rule(
                modules.with_rule_name(Self::rule_name("Subtract")),
                400,
                just_operator_parser("-"),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("Multiply")),
                200,
                just_operator_parser("*"),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("Divide")),
                200,
                just_operator_parser("/"),
            ),
            postfix_rule(
                modules.with_rule_name(Self::rule_name("Exponent")),
                850,
                just_operator_parser("^"),
            ),
            postfix_rule(
                modules.with_rule_name(Self::rule_name("Factorial")),
                600,
                just_operator_parser("!"),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<crate::autocomplete::AutocompleteRule> {
        vec![
            AutocompleteRule::new("/", input_nodes! {(fraction (row), (row))}),
            AutocompleteRule::new("sqrt", input_nodes! {(root (row), (row))}),
        ]
    }
}
