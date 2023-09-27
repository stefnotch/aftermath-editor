use crate::make_parser::just_operator_parser;
use crate::parser_extensions::just_symbol;
use crate::syntax_tree::{LeafNodeType, SyntaxNodeBuilder};
use crate::{
    autocomplete::AutocompleteRule,
    rule_collection::{RuleCollection, TokenRule},
    syntax_tree::NodeIdentifier,
};
use chumsky::{prelude::*, Parser};
use input_tree::input_nodes;
use input_tree::node::InputNode;

/// Rules for basic arithmetic.
pub struct ArithmeticRules;

impl ArithmeticRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Arithmetic".into(), name.into()])
    }
}

impl RuleCollection for ArithmeticRules {
    fn get_rules() -> Vec<crate::rule_collection::TokenRule> {
        vec![
            TokenRule::new(
                Self::rule_name("Number"),
                (None, None),
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
                        .with_ctx(())
                        .boxed()
                }),
            ),
            TokenRule::new(
                Self::rule_name("Add"),
                (Some(100), Some(101)),
                just_operator_parser("+"),
            ),
            TokenRule::new(
                Self::rule_name("Subtract"),
                (Some(100), Some(101)),
                just_operator_parser("-"),
            ),
            TokenRule::new(
                Self::rule_name("Add"),
                (None, Some(400)),
                just_operator_parser("+"),
            ),
            TokenRule::new(
                Self::rule_name("Subtract"),
                (None, Some(400)),
                just_operator_parser("-"),
            ),
            TokenRule::new(
                Self::rule_name("Multiply"),
                (Some(200), Some(201)),
                just_operator_parser("*"),
            ),
            TokenRule::new(
                Self::rule_name("Divide"),
                (Some(200), Some(201)),
                just_operator_parser("/"),
            ),
            TokenRule::new(
                Self::rule_name("Exponent"),
                (Some(850), None),
                just_operator_parser("^"),
            ),
            TokenRule::new(
                Self::rule_name("Factorial"),
                (Some(600), None),
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
