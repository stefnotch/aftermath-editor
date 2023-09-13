use std::sync::Arc;

use chumsky::{cache::Cached, span::SimpleSpan, Boxed, Parser};

use crate::{
    rule_collection::{BindingPowerType, TokenRule},
    syntax_tree::{SyntaxNode, SyntaxNodeChildren},
    NodeParserExtra, ParserInput, PrattParseContext,
};

use super::greedy_choice::greedy_choice;

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

fn build_prefix_syntax_node(op: SyntaxNode, rhs: SyntaxNode) -> SyntaxNode {
    SyntaxNode::new(
        op.name.clone(),
        combine_ranges(op.range(), rhs.range()),
        SyntaxNodeChildren::Children(vec![op, rhs]),
    )
}

fn build_postfix_syntax_node(op: SyntaxNode, lhs: SyntaxNode) -> SyntaxNode {
    SyntaxNode::new(
        op.name.clone(),
        combine_ranges(op.range(), lhs.range()),
        SyntaxNodeChildren::Children(vec![lhs, op]),
    )
}

fn build_infix_syntax_node(op: SyntaxNode, children: [SyntaxNode; 2]) -> SyntaxNode {
    let [lhs, rhs] = children;
    SyntaxNode::new(
        op.name.clone(),
        combine_ranges(op.range(), combine_ranges(lhs.range(), rhs.range())),
        SyntaxNodeChildren::Children(vec![lhs, op, rhs]),
    )
}

/// See https://github.com/zesterer/chumsky/blob/f10e56b7eac878cbad98f71fd5485a21d44db226/src/lib.rs#L3456
impl Cached for CachedMathParser {
    type Parser<'src> = Boxed<'src, 'src, ParserInput<'src>, SyntaxNode, NodeParserExtra>;

    fn make_parser<'src>(self) -> Self::Parser<'src> {
        // TODO: Change this from a pratt parser to a more classical "recursive descent + precedence climbing"
        // That lets us do better error reporting and recovery
        let mut chain = chumsky::recursive::Recursive::declare();

        let mut token_parsers = vec![];
        let mut prefix_parsers = vec![];
        let mut postfix_parsers = vec![];
        let mut infix_parsers = vec![];

        let token_rules = self.token_rules.clone();
        for rule in token_rules.iter() {
            // Okay, so to move something into the closure
            // I first had to create a copy here
            // And then had to create a copy inside the closure
            let rule_name = rule.name.clone();
            let rule_parser = rule.make_parser.build(chain.clone().boxed()).map_with_span(
                move |v, range: SimpleSpan| v.build(rule_name.clone(), range.into_range()),
            );
            match rule.binding_power_type() {
                BindingPowerType::Atom => {
                    // Or .clone()?
                    token_parsers.push(rule_parser);
                }
                BindingPowerType::Prefix(strength) => {
                    prefix_parsers.push(chumsky::pratt::prefix(
                        rule_parser,
                        strength,
                        build_prefix_syntax_node,
                    ));
                }
                BindingPowerType::Postfix(strength) => {
                    postfix_parsers.push(chumsky::pratt::postfix(
                        rule_parser,
                        strength,
                        build_postfix_syntax_node,
                    ));
                }
                BindingPowerType::LeftInfix(strength) => {
                    infix_parsers.push(chumsky::pratt::left_infix(
                        rule_parser,
                        strength,
                        build_infix_syntax_node,
                    ));
                }
                BindingPowerType::RightInfix(strength) => {
                    infix_parsers.push(chumsky::pratt::right_infix(
                        rule_parser,
                        strength,
                        build_infix_syntax_node,
                    ));
                }
            }
        }
        std::mem::drop(token_rules);

        // Here's to hoping that greedy_choice doesn't devolve into exponential time
        let atom = greedy_choice(token_parsers);
        let operator = greedy_choice(infix_parsers);
        let prefix = greedy_choice(prefix_parsers);
        let postfix = greedy_choice(postfix_parsers);

        // I'll accept two limitations for now
        // - A sequence of commas will end up being nested
        // - |abs| works, because it acts like an atom. So we start parsing a | and invoke the main parser which parses the abs atom.
        //   Then the main parser encounters a | atom, and bails out. At this point, the |abs| parser can finish parsing the |.

        // TODO: Good whitespace handling
        /*(
            TokenMatcher::Pattern( NFABuilder::match_character((' ').into()).build(),
        ),
            TokenDefinition::new(minimal_definitions.empty.clone(), (None, None)),
        ),*/

        chain.define(
            atom.pratt(operator)
                .with_prefix_ops(prefix)
                .with_postfix_ops(postfix),
        );

        chain.boxed()
    }
}
