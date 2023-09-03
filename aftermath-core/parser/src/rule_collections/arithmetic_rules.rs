use crate::syntax_tree::{SyntaxLeafNode, SyntaxNodeChildren};
use crate::SyntaxNode;
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
        let a = TokenRule::new(Self::rule_name("Number"), (None, None), |_, _| {
            let digits = select! {
              InputNode::Symbol(a) if a.chars().all(|v| v.is_ascii_digit()) => a,
            }
            .repeated()
            .at_least(1)
            .collect::<Vec<_>>();
            digits
                .then(just(InputNode::symbol(".")).then(digits).or_not())
                .map(|(mut a, b)| {
                    if let Some((_, b)) = b {
                        a.push(".".to_string());
                        a.extend(b);
                    }
                    a
                })
                .map_with_span(|v, range: SimpleSpan| {
                    SyntaxNode::new(
                        Self::rule_name("Number"),
                        range.clone().into_range(),
                        SyntaxNodeChildren::Leaf(SyntaxLeafNode::new(
                            crate::syntax_tree::LeafNodeType::Symbol,
                            range.into_range(),
                            v,
                        )),
                    )
                })
                .boxed()
        });

        vec![a]
    }

    fn get_autocomplete_rules() -> Vec<crate::autocomplete::AutocompleteRule> {
        vec![
            AutocompleteRule::new(input_nodes! {(fraction (row), (row))}, "/"),
            AutocompleteRule::new(input_nodes! {(root (row), (row))}, "sqrt"),
            AutocompleteRule::new(input_nodes! {(sup (row))}, "^"),
        ]
    }
}
