use input_tree::node::InputNode;

use crate::{
    parser::pratt_parser::{PrattParser, PrattSymbolParsers, RcOrWeak},
    parser_debug_error::ParserDebugError,
    syntax_tree::{SyntaxNode, SyntaxNodeBuilder},
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
        BoxedNothingParser<'a, 'b>,
        SyntaxNode,
        SyntaxNode,
    >,
>;

pub type RcPrattParserType<'a, 'b> = RcOrWeak<PrattParserType<'a, 'b>>;
