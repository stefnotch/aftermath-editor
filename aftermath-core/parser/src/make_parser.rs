use chumsky::Parser;

use crate::{
    parser_extensions::just_symbols,
    rule_collection::{BoxedTokenParser, RcPrattParserType},
    syntax_tree::{LeafNodeType, SyntaxNodeBuilder},
};

pub trait MakeParser: 'static {
    fn build<'a>(&self, parser: RcPrattParserType<'a, 'a>) -> BoxedTokenParser<'a, 'a>;
}

// https://stackoverflow.com/a/66714422 ?
pub struct MakeParserFn<T>(pub T)
where
    T: for<'a> Fn(RcPrattParserType<'a, 'a>) -> BoxedTokenParser<'a, 'a> + 'static;
impl<T> MakeParser for MakeParserFn<T>
where
    T: for<'a> Fn(RcPrattParserType<'a, 'a>) -> BoxedTokenParser<'a, 'a> + 'static,
{
    fn build<'a>(&self, parser: RcPrattParserType<'a, 'a>) -> BoxedTokenParser<'a, 'a> {
        (self.0)(parser)
    }
}

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
    fn build<'a>(&self, _parser: RcPrattParserType<'a, 'a>) -> BoxedTokenParser<'a, 'a> {
        let node_type = self.node_type;
        just_symbols(&self.symbols)
            .map(move |v| SyntaxNodeBuilder::new_leaf_node(vec![v], node_type))
            .with_ctx(())
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
