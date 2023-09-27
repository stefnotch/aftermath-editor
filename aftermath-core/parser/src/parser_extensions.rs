use chumsky::{extra::ParserExtra, Parser};
use input_tree::node::InputNode;

pub fn just_symbol<'a, E: ParserExtra<'a, &'a [InputNode]>>(
    symbol: impl Into<String>,
) -> impl chumsky::Parser<'a, &'a [InputNode], String, E> {
    chumsky::primitive::just(InputNode::Symbol(symbol.into())).map(|v| match v {
        InputNode::Symbol(v) => v,
        _ => panic!("Expected symbol"),
    })
}

pub fn just_symbols<'a, E: ParserExtra<'a, &'a [InputNode]>>(
    symbols: &Vec<String>,
) -> impl chumsky::Parser<'a, &'a [InputNode], String, E> {
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
