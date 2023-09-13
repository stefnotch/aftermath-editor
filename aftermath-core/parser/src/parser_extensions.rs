use chumsky::Parser;
use input_tree::node::InputNode;

use crate::rule_collection::TokenParserExtra;

pub fn just_symbol<'a>(
    symbol: impl Into<String>,
) -> impl chumsky::Parser<'a, &'a [InputNode], String, TokenParserExtra> {
    chumsky::primitive::just(InputNode::Symbol(symbol.into())).map(|v| match v {
        InputNode::Symbol(v) => v,
        _ => panic!("Expected symbol"),
    })
}

pub fn just_symbols<'a>(
    symbols: &Vec<String>,
) -> impl chumsky::Parser<'a, &'a [InputNode], String, TokenParserExtra> {
    let symbol_nodes = symbols
        .iter()
        .map(|v| InputNode::Symbol(v.clone()))
        .collect::<Vec<_>>();
    chumsky::primitive::just(symbol_nodes).map(|v| {
        v.into_iter()
            .map(|v| match v {
                InputNode::Symbol(v) => v,
                _ => panic!("Expected symbol"),
            })
            .collect::<String>()
    })
}
