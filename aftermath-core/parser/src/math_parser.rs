use std::rc::Rc;

use chumsky::{cache::Cached, span::SimpleSpan, util::MaybeRef, Boxed, IterParser, Parser};
use input_tree::node::{InputNode, InputNodeVariant};

use crate::{
    make_parser::MakeParser,
    parse_module::ParseRule,
    parse_modules::ParseModuleCollection,
    parser::pratt_parser::{
        self, pratt_parse_recursive, BindingPower, PrattParseErrorHandler, PrattParser,
    },
    rule_collection::{BasicParserExtra, ParserInput},
    syntax_tree::{SyntaxNode, SyntaxNodeBuilder, SyntaxNodeChildren},
};

pub struct CachedMathParser {
    parse_modules: ParseModuleCollection,
}
impl CachedMathParser {
    pub fn new(parse_modules: ParseModuleCollection) -> Self {
        Self { parse_modules }
    }
}

fn combine_ranges(a: std::ops::Range<usize>, b: std::ops::Range<usize>) -> std::ops::Range<usize> {
    let start = a.start.min(b.start);
    let end = a.end.max(b.end);
    start..end
}

/// See https://github.com/zesterer/chumsky/blob/f10e56b7eac878cbad98f71fd5485a21d44db226/src/lib.rs#L3456
impl Cached for CachedMathParser {
    type Parser<'src> = Boxed<'src, 'src, ParserInput<'src>, SyntaxNode, BasicParserExtra>;

    fn make_parser<'src>(self) -> Self::Parser<'src> {
        pratt_parse_recursive(move |pratt| {
            let built_in_rules = self.parse_modules.get_built_in().clone();
            let with_operator_name = {
                let new_row_rule_name = built_in_rules.new_row_rule_name.clone();
                let argument_rule_name = built_in_rules.argument_rule_name.clone();
                let operator_rule_name = built_in_rules.operator_rule_name.clone();
                Rc::new(move |mut op: SyntaxNode| {
                    match &op.children {
                        SyntaxNodeChildren::NewRows(_) => op.name = new_row_rule_name,
                        SyntaxNodeChildren::Children(_) => op.name = argument_rule_name,
                        SyntaxNodeChildren::Leaf(_) => op.name = operator_rule_name,
                    }
                    op
                })
            };
            let build_prefix_syntax_node = {
                let with_operator_name = with_operator_name.clone();
                Rc::new(move |op: SyntaxNode, rhs: SyntaxNode| {
                    SyntaxNode::new(
                        op.name.clone(),
                        combine_ranges(op.range(), rhs.range()),
                        SyntaxNodeChildren::Children(vec![(with_operator_name.clone())(op), rhs]),
                    )
                })
            };
            let build_postfix_syntax_node = {
                let with_operator_name = with_operator_name.clone();
                Rc::new(move |op: SyntaxNode, lhs: SyntaxNode| {
                    SyntaxNode::new(
                        op.name.clone(),
                        combine_ranges(lhs.range(), op.range()),
                        SyntaxNodeChildren::Children(vec![lhs, (with_operator_name.clone())(op)]),
                    )
                })
            };
            let build_infix_syntax_node = {
                let with_operator_name = with_operator_name.clone();
                Rc::new(move |op: SyntaxNode, children: (SyntaxNode, SyntaxNode)| {
                    let (lhs, rhs) = children;
                    SyntaxNode::new(
                        op.name.clone(),
                        combine_ranges(lhs.range(), combine_ranges(op.range(), rhs.range())),
                        SyntaxNodeChildren::Children(vec![
                            lhs,
                            (with_operator_name.clone())(op),
                            rhs,
                        ]),
                    )
                })
            };

            // For whitespace handling, we'll extend every parser to accept whitespaces around it.
            // And then input that info into the syntax tree.
            let mut atom_parsers = vec![];
            let mut prefix_parsers = vec![];
            let mut postfix_parsers = vec![];
            let mut infix_parsers = vec![];
            let mut ending_parsers = vec![];

            let space_parser = chumsky::select_ref! {
              input_tree::node::InputNode::Symbol(v) if v == " " => v.clone(),
            }
            .repeated()
            .collect::<Vec<_>>()
            .map_with_span({
                let built_in_rules = built_in_rules.clone();
                move |v, range: SimpleSpan| {
                    if !v.is_empty() {
                        Some(built_in_rules.whitespace_node(v, range.into_range()))
                    } else {
                        None
                    }
                }
            });

            // Iterate over the token rules in reverse order, so that later rules take priority
            let token_rules = self
                .parse_modules
                .get_modules()
                .iter()
                .flat_map(|v| v.get_rules())
                .rev();
            for rule in token_rules {
                if let ParseRule::NameOnly(_) = rule {
                    continue;
                }
                if let ParseRule::RecoveryEnding(recovery_parser) = rule {
                    ending_parsers.push(recovery_parser.build(pratt.clone()).map(|_| ()).boxed());
                    continue;
                }

                // Okay, so to move something into the closure
                // I first had to create a copy here
                // And then had to create a copy inside the closure
                let rule_name = match rule {
                    ParseRule::Atom(name, _)
                    | ParseRule::Prefix(name, _, _)
                    | ParseRule::LeftInfix(name, _, _)
                    | ParseRule::RightInfix(name, _, _)
                    | ParseRule::Postfix(name, _, _) => name,
                    ParseRule::NameOnly(_) => unreachable!(),
                    ParseRule::RecoveryEnding(_) => unreachable!(),
                }
                .clone();

                let make_parser = match rule {
                    ParseRule::Atom(_, make_parser)
                    | ParseRule::Prefix(_, _, make_parser)
                    | ParseRule::LeftInfix(_, _, make_parser)
                    | ParseRule::RightInfix(_, _, make_parser)
                    | ParseRule::Postfix(_, _, make_parser) => make_parser,
                    ParseRule::NameOnly(_) => unreachable!(),
                    ParseRule::RecoveryEnding(_) => unreachable!(),
                };

                // This parses the basic tokens with spaces around them
                // And the pratt parser joins them together
                let rule_parser = space_parser
                    .clone()
                    .then(make_parser.build(pratt.clone()).map_with_span(
                        move |v, range: SimpleSpan| v.build(rule_name.clone(), range.into_range()),
                    ))
                    .then(space_parser.clone())
                    .map_with_span({
                        let built_in_rules = built_in_rules.clone();
                        move |((spaces_before, node), spaces_after), range: SimpleSpan| {
                            built_in_rules.whitespaces_node(
                                spaces_before,
                                node,
                                spaces_after,
                                range.into_range(),
                            )
                        }
                    });

                // For prefix and infix, we will accept "sub" and "sup" after the operator.
                // e.g. sum_{n=0}^{10} n^2 is a prefix-operator called "sum" with a sub and sup.
                // e.g. \circ_0 is an infix-operator called "+" with a sub. That can appear when writing down formal grammars.

                let sub_parser = built_in_rules
                    .make_container_parser(InputNodeVariant::Sub)
                    .build(pratt.clone())
                    .map_with_span({
                        let built_in_rules = built_in_rules.clone();
                        move |v, range: SimpleSpan| {
                            v.build(built_in_rules.sub_rule_name, range.into_range())
                        }
                    });
                let sup_parser = built_in_rules
                    .make_container_parser(InputNodeVariant::Sup)
                    .build(pratt.clone())
                    .map_with_span({
                        let built_in_rules = built_in_rules.clone();
                        move |v: SyntaxNodeBuilder, range: SimpleSpan| {
                            v.build(built_in_rules.sup_rule_name, range.into_range())
                        }
                    });

                let build_postfix_syntax_node_copy = build_postfix_syntax_node.clone();
                // TODO: Accept spaces after this
                let rule_parser = match rule {
                    ParseRule::Atom(_, _) => rule_parser.boxed(),
                    ParseRule::Postfix(_, _, _) => rule_parser.boxed(),
                    ParseRule::Prefix(_, _, _)
                    | ParseRule::LeftInfix(_, _, _)
                    | ParseRule::RightInfix(_, _, _) => rule_parser
                        .then(
                            chumsky::prelude::choice((sub_parser, sup_parser))
                                .repeated()
                                .collect::<Vec<_>>(),
                        )
                        .map(move |(mut node, sub_sups)| {
                            for postfix_op in sub_sups {
                                node = (build_postfix_syntax_node_copy.clone())(postfix_op, node);
                            }
                            node
                        })
                        .boxed(),
                    ParseRule::NameOnly(_) => unreachable!(),
                    ParseRule::RecoveryEnding(_) => unreachable!(),
                };

                // with_ctx(...) is such a weird function. It fully specifies a parser context, and then lets you use it as a parser with a different context.
                // let rule_parser: Boxed<'_, '_, _, _, chumsky::extra::Full<_, _, PrattParseContext>> =
                // rule_parser.with_ctx(()).boxed();

                match rule {
                    ParseRule::Atom(_, _) => atom_parsers.push(rule_parser),
                    ParseRule::Prefix(_, strength, _) => prefix_parsers.push(pratt_parser::prefix(
                        rule_parser,
                        *strength,
                        build_prefix_syntax_node.clone(),
                    )),
                    ParseRule::LeftInfix(_, strength, _) => {
                        infix_parsers.push(pratt_parser::left_infix(
                            rule_parser,
                            *strength,
                            build_infix_syntax_node.clone(),
                        ))
                    }
                    ParseRule::RightInfix(_, strength, _) => {
                        infix_parsers.push(pratt_parser::right_infix(
                            rule_parser,
                            *strength,
                            build_infix_syntax_node.clone(),
                        ))
                    }
                    ParseRule::Postfix(_, strength, _) => {
                        postfix_parsers.push(pratt_parser::postfix(
                            rule_parser,
                            *strength,
                            build_postfix_syntax_node.clone(),
                        ))
                    }
                    ParseRule::NameOnly(_) => unreachable!(),
                    ParseRule::RecoveryEnding(_) => unreachable!(),
                };
            }

            // I'm not using greedy_choice for now.
            let atom = chumsky::primitive::choice(atom_parsers);
            let ending_parser = chumsky::primitive::choice(ending_parsers).boxed();

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
                    make_missing_atom: Rc::new({
                        let built_in_rules = built_in_rules.clone();
                        move |span: SimpleSpan| built_in_rules.error_missing_token(span.end)
                    }),
                    make_missing_operator: Rc::new({
                        let built_in_rules = built_in_rules.clone();
                        move |_span: SimpleSpan, (child_a, child_b)| {
                            built_in_rules.error_missing_operator(
                                combine_ranges(child_a.range(), child_b.range()),
                                child_a,
                                child_b,
                            )
                        }
                    }),
                    make_unknown_atom: Rc::new({
                        let built_in_rules = built_in_rules.clone();
                        move |span: SimpleSpan, value: MaybeRef<InputNode>| {
                            let values = [value.into_inner()];
                            // TODO: This one should do special handling like "frac/sub/table/... always gets parsed".
                            built_in_rules
                                .error_unknown_token(span.start..(span.start + 1), &values[..])
                        }
                    }),
                    missing_operator_binding_power: BindingPower::LeftInfix(100),
                },
            );

            parser
        })
        .boxed()
    }
}
