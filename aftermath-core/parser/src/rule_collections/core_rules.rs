use crate::parser::pratt_parser_old::PrattParseContext;
use crate::parser_extensions::just_symbol;

use crate::rule_collection::{ContextualParserExtra, ParseContext};
use crate::syntax_tree::{LeafNodeType, SyntaxNode, SyntaxNodeBuilder, SyntaxNodeChildren};
use crate::{
    autocomplete::AutocompleteRule,
    rule_collection::{RuleCollection, TokenRule},
    syntax_tree::NodeIdentifier,
};
use chumsky::{prelude::*, Parser};

use input_tree::node::InputNode;
use unicode_ident::{is_xid_continue, is_xid_start};

use super::built_in_rules::BuiltInRules;

/// Core rules that one basically always wants.
pub struct CoreRules {}

impl CoreRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Core".into(), name.into()])
    }

    pub fn make_brackets_parser(
        starting_bracket: impl Into<String>,
        ending_bracket: impl Into<String>,
    ) -> impl crate::make_parser::MakeParser {
        let starting_bracket: String = starting_bracket.into();
        let ending_bracket: String = ending_bracket.into();
        crate::make_parser::MakeParserFn(move |parser| {
            let ending_bracket_1: String = ending_bracket.clone();

            just_symbol(starting_bracket.clone())
                .map_with_span(|v, span| (v, span.into_range()))
                .then(
                    map_ctx(
                        move |ctx: &ParseContext<'_>| {
                            ctx.with(
                                Default::default(),
                                just_symbol(ending_bracket_1.clone()).map(|_| ()).boxed(),
                            )
                        },
                        parser,
                    )
                    .boxed(),
                )
                .then(
                    just_symbol(ending_bracket.clone())
                        .map_with_span(|v, span| (v, span.into_range())),
                )
                .map(
                    |(
                        ((left_bracket, left_bracket_span), child),
                        (right_bracket, right_bracket_span),
                    )| {
                        let mut children = vec![];
                        children.push(
                            SyntaxNodeBuilder::new_leaf_node(
                                vec![left_bracket],
                                LeafNodeType::Operator,
                            )
                            .build(BuiltInRules::operator_rule_name(), left_bracket_span),
                        );
                        children.push(child);
                        children.push(
                            SyntaxNodeBuilder::new_leaf_node(
                                vec![right_bracket],
                                LeafNodeType::Operator,
                            )
                            .build(BuiltInRules::operator_rule_name(), right_bracket_span),
                        );
                        SyntaxNodeBuilder::new(SyntaxNodeChildren::Children(children))
                    },
                )
                .boxed()
        })
    }
}

fn is_identifier_start(value: &str) -> bool {
    let mut chars = value.chars();
    let matches = chars.next().map(|c| is_xid_start(c)).unwrap_or(false);
    matches && chars.all(|c| is_xid_continue(c))
}

fn is_identifier_continue(value: &str) -> bool {
    value.chars().all(|c| is_xid_continue(c))
}

impl RuleCollection for CoreRules {
    fn get_rules() -> Vec<TokenRule> {
        vec![
            TokenRule::new(
                Self::rule_name("Variable"),
                (None, None),
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

            // Can also parse unit tuples
            TokenRule::new(
                Self::rule_name("RoundBrackets"),
                (None, None),
                Self::make_brackets_parser("(", ")"),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
