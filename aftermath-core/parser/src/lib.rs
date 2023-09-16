use input_tree::node::InputNode;
use parser::pratt_parser::PrattParseContext;

pub mod autocomplete;
pub mod make_parser;
pub mod parser;
pub mod parser_extensions;
pub mod rule_collection;
pub mod rule_collections;
pub mod syntax_tree;

pub type ParserInput<'a> = &'a [InputNode];

// chumsky::prelude::Cheap
pub type NodeParserExtra = chumsky::extra::Full<ParserDebugError<InputNode>, (), PrattParseContext>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParserDebugError<T, S = chumsky::span::SimpleSpan<usize>> {
    span: S,
    expected: Vec<Option<T>>,
    found: Option<T>,
}

impl<'a, I: chumsky::prelude::Input<'a>> chumsky::error::Error<'a, I>
    for ParserDebugError<I::Token, I::Span>
where
    I::Token: Clone,
{
    fn expected_found<E: IntoIterator<Item = Option<chumsky::util::MaybeRef<'a, I::Token>>>>(
        expected: E,
        found: Option<chumsky::util::MaybeRef<'a, I::Token>>,
        span: I::Span,
    ) -> Self {
        Self {
            span,
            expected: expected
                .into_iter()
                .map(|v| v.map(|v| v.into_inner()))
                .collect(),
            found: found.map(|f| f.into_inner()),
        }
    }
}
