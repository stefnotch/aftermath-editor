use std::sync::Arc;

use chumsky::{cache::Cached, span::SimpleSpan, Boxed, IterParser, Parser};

use crate::{
    rule_collection::{BindingPowerType, TokenRule},
    rule_collections::built_in_rules::BuiltInRules,
    syntax_tree::{
        LeafNodeType, SyntaxLeafNode, SyntaxNode, SyntaxNodeBuilder, SyntaxNodeChildren,
    },
    NodeParserExtra, ParserInput,
};

use super::{
    greedy_choice::greedy_choice,
    pratt_parser::{self, pratt_parser, PrattParseContext},
};

pub struct CachedMathParser {
    token_rules: Arc<Vec<TokenRule>>,
}
impl CachedMathParser {
    pub fn new(token_rules: Arc<Vec<TokenRule>>) -> Self {
        Self { token_rules }
    }
}

fn combine_ranges(a: std::ops::Range<usize>, b: std::ops::Range<usize>) -> std::ops::Range<usize> {
    let start = a.start.min(b.start);
    let end = a.end.max(b.end);
    start..end
}

fn with_operator_name(mut op: SyntaxNode) -> SyntaxNode {
    match &op.children {
        SyntaxNodeChildren::NewRows(_) => op.name = BuiltInRules::new_row_rule_name(),
        SyntaxNodeChildren::Children(_) => op.name = BuiltInRules::argument_name(),
        SyntaxNodeChildren::Leaf(_) => op.name = BuiltInRules::operator_rule_name(),
    }
    op
}

fn build_prefix_syntax_node(op: SyntaxNode, rhs: SyntaxNode) -> SyntaxNode {
    SyntaxNode::new(
        op.name.clone(),
        combine_ranges(op.range(), rhs.range()),
        SyntaxNodeChildren::Children(vec![with_operator_name(op), rhs]),
    )
}

fn build_postfix_syntax_node(op: SyntaxNode, lhs: SyntaxNode) -> SyntaxNode {
    SyntaxNode::new(
        op.name.clone(),
        combine_ranges(op.range(), lhs.range()),
        SyntaxNodeChildren::Children(vec![lhs, with_operator_name(op)]),
    )
}

fn build_infix_syntax_node(op: SyntaxNode, children: [SyntaxNode; 2]) -> SyntaxNode {
    let [lhs, rhs] = children;
    SyntaxNode::new(
        op.name.clone(),
        combine_ranges(op.range(), combine_ranges(lhs.range(), rhs.range())),
        SyntaxNodeChildren::Children(vec![lhs, with_operator_name(op), rhs]),
    )
}

/// See https://github.com/zesterer/chumsky/blob/f10e56b7eac878cbad98f71fd5485a21d44db226/src/lib.rs#L3456
impl Cached for CachedMathParser {
    type Parser<'src> = Boxed<'src, 'src, ParserInput<'src>, SyntaxNode, NodeParserExtra>;

    fn make_parser<'src>(self) -> Self::Parser<'src> {
        // For whitespace handling, we'll extend every parser to accept whitespaces around it.
        // And then input that info into the syntax tree.
        let mut chain = chumsky::recursive::Recursive::declare();

        let mut token_parsers = vec![];
        let mut prefix_parsers = vec![];
        let mut postfix_parsers = vec![];
        let mut infix_parsers = vec![];

        let space_parser = chumsky::select_ref! {
          input_tree::node::InputNode::Symbol(v) if v == " " => v.clone(),
        }
        .repeated()
        .collect::<Vec<_>>()
        .map_with_span(|v, range: SimpleSpan| {
            if v.len() > 0 {
                Some(
                    SyntaxNodeBuilder::new_leaf_node(v, LeafNodeType::Operator)
                        .build(BuiltInRules::whitespace_rule_name(), range.into_range()),
                )
            } else {
                None
            }
        });

        let token_rules = self.token_rules.clone();
        // Iterate over the token rules in reverse order, so that later rules take priority
        for rule in token_rules.iter().rev() {
            // Okay, so to move something into the closure
            // I first had to create a copy here
            // And then had to create a copy inside the closure
            let rule_name = rule.name.clone();
            // This only parses the basic tokens, it doesn't join them together
            let rule_parser = space_parser
                .then(rule.make_parser.build(chain.clone().boxed()).map_with_span(
                    move |v, range: SimpleSpan| v.build(rule_name.clone(), range.into_range()),
                ))
                .then(space_parser)
                .map_with_span(|((spaces_before, node), spaces_after), range: SimpleSpan| {
                    match (spaces_before, spaces_after) {
                        (Some(spaces_before), Some(spaces_after)) => SyntaxNode::new(
                            BuiltInRules::whitespaces_rule_name(),
                            range.into_range(),
                            SyntaxNodeChildren::Children(vec![spaces_before, node, spaces_after]),
                        ),
                        (None, Some(spaces_after)) => SyntaxNode::new(
                            BuiltInRules::whitespaces_rule_name(),
                            range.into_range(),
                            SyntaxNodeChildren::Children(vec![node, spaces_after]),
                        ),
                        (Some(spaces_before), None) => SyntaxNode::new(
                            BuiltInRules::whitespaces_rule_name(),
                            range.into_range(),
                            SyntaxNodeChildren::Children(vec![spaces_before, node]),
                        ),
                        (None, None) => node,
                    }
                });
            match rule.binding_power_type() {
                BindingPowerType::Atom => {
                    // Or .clone()?
                    token_parsers.push(rule_parser);
                }
                BindingPowerType::Prefix(strength) => {
                    prefix_parsers.push(pratt_parser::prefix(
                        rule_parser,
                        strength,
                        build_prefix_syntax_node,
                    ));
                }
                BindingPowerType::Postfix(strength) => {
                    postfix_parsers.push(pratt_parser::postfix(
                        rule_parser,
                        strength,
                        build_postfix_syntax_node,
                    ));
                }
                BindingPowerType::LeftInfix(strength) => {
                    infix_parsers.push(pratt_parser::left_infix(
                        rule_parser,
                        strength,
                        build_infix_syntax_node,
                    ));
                }
                BindingPowerType::RightInfix(strength) => {
                    infix_parsers.push(pratt_parser::right_infix(
                        rule_parser,
                        strength,
                        build_infix_syntax_node,
                    ));
                }
            }
        }
        std::mem::drop(token_rules);

        // I'm not using greedy_choice for now.
        let atom = chumsky::primitive::choice(token_parsers);

        // I'll accept two limitations for now
        // - A sequence of commas will end up being nested
        // - |abs| works, because it acts like an atom. So we start parsing a | and invoke the main parser which parses the abs atom.
        //   Then the main parser encounters a | atom, and bails out. At this point, the |abs| parser can finish parsing the |.

        let empty_row_parser = chumsky::primitive::end()
            .boxed()
            .map(|_| BuiltInRules::nothing_node(0..0));

        chain.define(
            pratt_parser(atom, infix_parsers, prefix_parsers, postfix_parsers).or(empty_row_parser),
        );

        chain.boxed()
    }
}
