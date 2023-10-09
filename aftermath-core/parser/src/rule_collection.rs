use input_tree::node::InputNode;

use crate::{
    parser::pratt_parser::{
        InfixBuilder, PostfixBuilder, PrattParser, PrattSymbolParsers, PrefixBuilder, RcOrWeak,
    },
    parser_debug_error::ParserDebugError,
    syntax_tree::{SyntaxNode, SyntaxNodeBuilder, SyntaxNodeChildren, SyntaxNodeNameId},
};

pub type ParserInput<'a> = &'a [InputNode];

// chumsky::prelude::Cheap
pub type BasicParserExtra = chumsky::extra::Full<ParserDebugError<InputNode>, (), ()>;

// Oh look, it's a trait alias
pub trait TokenParser<'a>:
    chumsky::Parser<'a, ParserInput<'a>, SyntaxNodeBuilder, BasicParserExtra>
{
}
impl<'a, T> TokenParser<'a> for T where
    T: chumsky::Parser<'a, ParserInput<'a>, SyntaxNodeBuilder, BasicParserExtra>
{
}

pub type BoxedTokenParser<'a, 'b> =
    chumsky::Boxed<'a, 'b, ParserInput<'a>, SyntaxNodeBuilder, BasicParserExtra>;

// TODO: This should not be able to return any errors.
pub type BoxedNodeParser<'a, 'b> =
    chumsky::Boxed<'a, 'b, ParserInput<'a>, SyntaxNode, BasicParserExtra>;

pub type BoxedNothingParser<'a, 'b> = chumsky::Boxed<'a, 'b, ParserInput<'a>, (), BasicParserExtra>;

// TODO: Simplify this type?
pub type PrattParserType<'a, 'b> = PrattParser<
    'a,
    &'a [InputNode],
    SyntaxNode,
    BasicParserExtra,
    PrattSymbolParsers<
        chumsky::primitive::Choice<Vec<BoxedNodeParser<'a, 'b>>>,
        BoxedNodeParser<'a, 'b>,
        BoxedNodeParser<'a, 'b>,
        BoxedNodeParser<'a, 'b>,
        InfixBuilderImpl,
        PrefixBuilderImpl,
        PostfixBuilderImpl,
        SyntaxNode,
    >,
    BoxedNothingParser<'a, 'b>,
>;

pub type RcPrattParserType<'a, 'b> = RcOrWeak<PrattParserType<'a, 'b>>;

pub struct InfixBuilderImpl {
    pub name: SyntaxNodeNameId,
}

impl InfixBuilder<SyntaxNode, SyntaxNode> for InfixBuilderImpl {
    fn build(&self, op: SyntaxNode, children: (SyntaxNode, SyntaxNode)) -> SyntaxNode {
        let (left, right) = children;
        SyntaxNode::new(
            self.name,
            combine_ranges(left.range(), combine_ranges(op.range(), right.range())),
            SyntaxNodeChildren::Children(vec![left, op, right]),
        )
    }
}

pub struct PrefixBuilderImpl {
    pub name: SyntaxNodeNameId,
}

impl PrefixBuilder<SyntaxNode, SyntaxNode> for PrefixBuilderImpl {
    fn build(&self, op: SyntaxNode, right: SyntaxNode) -> SyntaxNode {
        SyntaxNode::new(
            self.name,
            combine_ranges(op.range(), right.range()),
            SyntaxNodeChildren::Children(vec![op, right]),
        )
    }
}

pub struct PostfixBuilderImpl {
    pub name: SyntaxNodeNameId,
}

impl PostfixBuilder<SyntaxNode, SyntaxNode> for PostfixBuilderImpl {
    fn build(&self, op: SyntaxNode, left: SyntaxNode) -> SyntaxNode {
        SyntaxNode::new(
            self.name,
            combine_ranges(left.range(), op.range()),
            SyntaxNodeChildren::Children(vec![left, op]),
        )
    }
}

fn combine_ranges(a: std::ops::Range<usize>, b: std::ops::Range<usize>) -> std::ops::Range<usize> {
    let start = a.start.min(b.start);
    let end = a.end.max(b.end);
    start..end
}
