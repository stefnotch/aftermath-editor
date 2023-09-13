use chumsky::Parser;

use crate::{
    parser_extensions::just_symbols,
    rule_collection::{BoxedNodeParser, BoxedTokenParser},
    syntax_tree::{LeafNodeType, SyntaxNodeBuilder},
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

pub trait VecOrString {
    fn into_vec(self) -> Vec<String>;
}

impl VecOrString for Vec<String> {
    fn into_vec(self) -> Vec<String> {
        self
    }
}
impl VecOrString for Vec<char> {
    fn into_vec(self) -> Vec<String> {
        self.into_iter().map(|v| v.to_string()).collect()
    }
}
impl VecOrString for Vec<&str> {
    fn into_vec(self) -> Vec<String> {
        self.into_iter().map(|v| v.to_string()).collect()
    }
}

impl VecOrString for String {
    fn into_vec(self) -> Vec<String> {
        vec![self]
    }
}

impl VecOrString for char {
    fn into_vec(self) -> Vec<String> {
        vec![self.to_string()]
    }
}

impl VecOrString for &str {
    fn into_vec(self) -> Vec<String> {
        vec![self.to_string()]
    }
}

pub struct MakeSymbolsParser {
    symbols: Vec<String>,
    node_type: LeafNodeType,
}
impl MakeParser for MakeSymbolsParser {
    fn build<'a>(&self, _parser: BoxedNodeParser<'a, 'a>) -> BoxedTokenParser<'a, 'a> {
        let node_type = self.node_type;
        just_symbols(&self.symbols)
            .map(move |v| SyntaxNodeBuilder::new_leaf_node(vec![v], node_type))
            .boxed()
    }
}

pub fn just_symbol_parser(symbol: impl VecOrString) -> impl MakeParser {
    MakeSymbolsParser {
        symbols: symbol.into_vec(),
        node_type: LeafNodeType::Symbol,
    }
}

pub fn just_operator_parser(operator: impl VecOrString) -> impl MakeParser {
    MakeSymbolsParser {
        symbols: operator.into_vec(),
        node_type: LeafNodeType::Operator,
    }
}