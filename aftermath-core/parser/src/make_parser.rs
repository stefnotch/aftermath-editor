use chumsky::Parser;

use crate::{
    parser::pratt_parser::{call_pratt_parser, Strength},
    parser_extensions::{just_symbol, just_symbols},
    rule_collection::{BoxedTokenParser, RcPrattParserType},
    syntax_tree::{LeafNodeType, SyntaxNodeBuilder, SyntaxNodeChildren, SyntaxNodeNameId},
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

pub fn make_brackets_parser(
    operator_rule_name: SyntaxNodeNameId,
    starting_bracket: impl Into<String>,
    ending_bracket: impl Into<String>,
) -> impl crate::make_parser::MakeParser {
    let starting_bracket: String = starting_bracket.into();
    let ending_bracket: String = ending_bracket.into();
    crate::make_parser::MakeParserFn(move |parser| {
        just_symbol(starting_bracket.clone())
            .map_with_span(|v, span| (v, span.into_range()))
            .then(call_pratt_parser(parser, (0, Strength::Weak), None))
            .then(
                just_symbol(ending_bracket.clone()).map_with_span(|v, span| (v, span.into_range())),
            )
            .map(
                move |(
                    ((left_bracket, left_bracket_span), child),
                    (right_bracket, right_bracket_span),
                )| {
                    let children = vec![
                        SyntaxNodeBuilder::new_leaf_node(
                            vec![left_bracket],
                            LeafNodeType::Operator,
                        )
                        .build(operator_rule_name, left_bracket_span),
                        child,
                        SyntaxNodeBuilder::new_leaf_node(
                            vec![right_bracket],
                            LeafNodeType::Operator,
                        )
                        .build(operator_rule_name, right_bracket_span),
                    ];
                    SyntaxNodeBuilder::new(SyntaxNodeChildren::Children(children))
                },
            )
            .boxed()
    })
}

pub fn make_empty_brackets_parser(
    operator_rule_name: SyntaxNodeNameId,
    starting_bracket: impl Into<String>,
    ending_bracket: impl Into<String>,
) -> impl crate::make_parser::MakeParser {
    let starting_bracket: String = starting_bracket.into();
    let ending_bracket: String = ending_bracket.into();
    crate::make_parser::MakeParserFn(move |_| {
        just_symbol(starting_bracket.clone())
            .map_with_span(|v, span| (v, span.into_range()))
            .then(
                just_symbol(ending_bracket.clone()).map_with_span(|v, span| (v, span.into_range())),
            )
            .map(
                move |((left_bracket, left_bracket_span), (right_bracket, right_bracket_span))| {
                    let children = vec![
                        SyntaxNodeBuilder::new_leaf_node(
                            vec![left_bracket],
                            LeafNodeType::Operator,
                        )
                        .build(operator_rule_name, left_bracket_span),
                        SyntaxNodeBuilder::new_leaf_node(
                            vec![right_bracket],
                            LeafNodeType::Operator,
                        )
                        .build(operator_rule_name, right_bracket_span),
                    ];
                    SyntaxNodeBuilder::new(SyntaxNodeChildren::Children(children))
                },
            )
            .boxed()
    })
}
