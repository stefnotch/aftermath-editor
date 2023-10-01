use std::rc::Rc;

use chumsky::{cache::Cached, span::SimpleSpan, util::MaybeRef, Boxed, IterParser, Parser};
use input_tree::node::{InputNode, InputNodeVariant};

use crate::{
    make_parser::MakeParser,
    parser::pratt_parser::{
        self, pratt_parse_recursive, BindingPower, PrattParseErrorHandler, PrattParser,
    },
    parser_extensions::just_symbol,
    rule_collection::{BasicParserExtra, ParserInput, TokenRule},
    rule_collections::built_in_rules::BuiltInRules,
    syntax_tree::{LeafNodeType, SyntaxNode, SyntaxNodeBuilder, SyntaxNodeChildren},
};

pub struct CachedMathParser {
    token_rules: Rc<Vec<TokenRule>>,
}
impl CachedMathParser {
    pub fn new(token_rules: Rc<Vec<TokenRule>>) -> Self {
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
        SyntaxNodeChildren::Children(_) => op.name = BuiltInRules::argument_rule_name(),
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

fn build_infix_syntax_node(op: SyntaxNode, children: (SyntaxNode, SyntaxNode)) -> SyntaxNode {
    let (lhs, rhs) = children;
    SyntaxNode::new(
        op.name.clone(),
        combine_ranges(op.range(), combine_ranges(lhs.range(), rhs.range())),
        SyntaxNodeChildren::Children(vec![lhs, with_operator_name(op), rhs]),
    )
}

/// See https://github.com/zesterer/chumsky/blob/f10e56b7eac878cbad98f71fd5485a21d44db226/src/lib.rs#L3456
impl Cached for CachedMathParser {
    type Parser<'src> = Boxed<'src, 'src, ParserInput<'src>, SyntaxNode, BasicParserExtra>;

    fn make_parser<'src>(self) -> Self::Parser<'src> {
        pratt_parse_recursive(|pratt| {
            // For whitespace handling, we'll extend every parser to accept whitespaces around it.
            // And then input that info into the syntax tree.
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
                if !v.is_empty() {
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

                // This parses the basic tokens with spaces around them
                // And the pratt parser joins them together
                let rule_parser = space_parser
                    .then(rule.make_parser.build(pratt.clone()).map_with_span(
                        move |v, range: SimpleSpan| v.build(rule_name.clone(), range.into_range()),
                    ))
                    .then(space_parser)
                    .map_with_span(
                        |((spaces_before, node), spaces_after), range: SimpleSpan| match (
                            spaces_before,
                            spaces_after,
                        ) {
                            (Some(spaces_before), Some(spaces_after)) => SyntaxNode::new(
                                BuiltInRules::whitespaces_rule_name(),
                                range.into_range(),
                                SyntaxNodeChildren::Children(vec![
                                    spaces_before,
                                    node,
                                    spaces_after,
                                ]),
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
                        },
                    );

                // For prefix and infix, we will accept "sub" and "sup" after the operator.
                // e.g. sum_{n=0}^{10} n^2 is a prefix-operator called "sum" with a sub and sup.
                // e.g. \circ_0 is an infix-operator called "+" with a sub. That can appear when writing down formal grammars.

                let sub_parser = BuiltInRules::make_container_parser(InputNodeVariant::Sub)
                    .build(pratt.clone())
                    .map_with_span(|v, range: SimpleSpan| {
                        v.build(BuiltInRules::sub_rule_name(), range.into_range())
                    });
                let sup_parser = BuiltInRules::make_container_parser(InputNodeVariant::Sup)
                    .build(pratt.clone())
                    .map_with_span(|v, range: SimpleSpan| {
                        v.build(BuiltInRules::sup_rule_name(), range.into_range())
                    });

                // TODO: Accept spaces after this
                let rule_parser = match rule.binding_power {
                    None => rule_parser.boxed(),
                    Some(BindingPower::Postfix(_)) => rule_parser.boxed(),
                    Some(BindingPower::Prefix(_))
                    | Some(BindingPower::LeftInfix(_))
                    | Some(BindingPower::RightInfix(_)) => rule_parser
                        .then(
                            chumsky::prelude::choice((sub_parser, sup_parser))
                                .repeated()
                                .collect::<Vec<_>>(),
                        )
                        .map(|(mut node, sub_sups)| {
                            for postfix_op in sub_sups {
                                node = build_postfix_syntax_node(postfix_op, node);
                            }
                            node
                        })
                        .boxed(),
                };

                // with_ctx(...) is such a weird function. It fully specifies a parser context, and then lets you use it as a parser with a different context.
                // let rule_parser: Boxed<'_, '_, _, _, chumsky::extra::Full<_, _, PrattParseContext>> =
                // rule_parser.with_ctx(()).boxed();

                match rule.binding_power {
                    None => token_parsers.push(rule_parser),
                    Some(BindingPower::Prefix(strength)) => prefix_parsers.push(
                        pratt_parser::prefix(rule_parser, strength, build_prefix_syntax_node),
                    ),
                    Some(BindingPower::Postfix(strength)) => postfix_parsers.push(
                        pratt_parser::postfix(rule_parser, strength, build_postfix_syntax_node),
                    ),
                    Some(BindingPower::LeftInfix(strength)) => infix_parsers.push(
                        pratt_parser::left_infix(rule_parser, strength, build_infix_syntax_node),
                    ),
                    Some(BindingPower::RightInfix(strength)) => infix_parsers.push(
                        pratt_parser::right_infix(rule_parser, strength, build_infix_syntax_node),
                    ),
                };
            }
            std::mem::drop(token_rules);

            // I'm not using greedy_choice for now.
            let atom = chumsky::primitive::choice(token_parsers);

            // TODO: Don't hardcode this
            let ending_parser = just_symbol(")")
                .map(|_| ())
                .or(chumsky::primitive::end())
                .boxed();

            // I'll accept two limitations for now
            // - A sequence of commas will end up being nested
            // - |abs| works, because it acts like an atom. So we start parsing a | and invoke the main parser which parses the abs atom.
            //   Then the main parser encounters a | atom, and bails out. At this point, the |abs| parser can finish parsing the |.
            let parser: crate::rule_collection::PrattParserType<'_, '_> = PrattParser::new(
                atom,
                infix_parsers,
                prefix_parsers,
                postfix_parsers,
                ending_parser,
                PrattParseErrorHandler {
                    make_missing_atom: |span: SimpleSpan| {
                        BuiltInRules::error_missing_token(span.end)
                    },
                    make_missing_operator: |_span: SimpleSpan, (child_a, child_b)| {
                        BuiltInRules::error_missing_operator(
                            combine_ranges(child_a.range(), child_b.range()),
                            child_a,
                            child_b,
                        )
                    },
                    make_unknown_atom: |span: SimpleSpan, value: MaybeRef<InputNode>| {
                        let values = [value.into_inner()];
                        // TODO: This one should do special handling like "frac/sub/table/... always gets parsed".
                        BuiltInRules::error_unknown_token(span.start..(span.start + 1), &values[..])
                    },
                    missing_operator_binding_power: BindingPower::LeftInfix(100),
                },
            );

            parser
        })
        .boxed()
    }
}
