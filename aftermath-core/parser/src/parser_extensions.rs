use chumsky::Parser;
use input_tree::node::InputNode;

use crate::TokenParserExtra;

pub fn just_symbol<'a>(
    symbol: impl Into<String>,
) -> impl chumsky::Parser<'a, &'a [InputNode], String, TokenParserExtra> {
    chumsky::primitive::just(InputNode::Symbol(symbol.into())).map(|v| match v {
        InputNode::Symbol(v) => v,
        _ => panic!("Expected symbol"),
    })
}
