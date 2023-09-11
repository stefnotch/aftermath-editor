use chumsky::Parser;

use crate::{
    parser_extensions::just_symbol,
    rule_collection::{BoxedNodeParser, BoxedTokenParser},
    syntax_tree::SyntaxNodeBuilder,
};

pub trait MakeParser: 'static {
    fn build<'a>(&self, parser: BoxedNodeParser<'a, 'a>) -> BoxedTokenParser<'a, 'a>;
}

// https://stackoverflow.com/a/66714422 ?
pub struct MakeParserFn<T>(pub T)
where
    T: for<'a> Fn(BoxedNodeParser<'a, 'a>) -> BoxedTokenParser<'a, 'a> + 'static;
impl<T> MakeParser for MakeParserFn<T>
where
    T: for<'a> Fn(BoxedNodeParser<'a, 'a>) -> BoxedTokenParser<'a, 'a> + 'static,
{
    fn build<'a>(&self, parser: BoxedNodeParser<'a, 'a>) -> BoxedTokenParser<'a, 'a> {
        (self.0)(parser)
    }
}

/*
impl<T> From<T> for MakeParserFn<T>
where
    T: for<'a, 'b> Fn(BoxedNodeParser<'a, 'b>) -> BoxedTokenParser<'a, 'b>,
{
    fn from(f: T) -> Self {
        Self(f)
    }
} */

pub struct MakeSymbolParser {
    symbol: String,
}
impl MakeParser for MakeSymbolParser {
    fn build<'a>(&self, _parser: BoxedNodeParser<'a, 'a>) -> BoxedTokenParser<'a, 'a> {
        just_symbol(self.symbol.clone())
            .map(|v| SyntaxNodeBuilder::new_symbol(vec![v]))
            .boxed()
    }
}

pub fn just_symbol_parser(symbol: impl Into<String>) -> impl MakeParser {
    MakeSymbolParser {
        symbol: symbol.into(),
    }
}
