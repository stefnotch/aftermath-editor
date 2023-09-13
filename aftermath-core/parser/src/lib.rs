use input_tree::node::InputNode;

pub mod autocomplete;
pub mod make_parser;
pub mod parser;
pub mod parser_extensions;
pub mod rule_collection;
pub mod rule_collections;
pub mod syntax_tree;

pub type ParserInput<'a> = &'a [InputNode];

#[derive(Clone)]
pub struct PrattParseContext {
    pub min_binding_power: u16,
}
pub type NodeParserExtra = chumsky::extra::Full<chumsky::prelude::Cheap, (), ()>;

impl Default for PrattParseContext {
    fn default() -> Self {
        Self {
            min_binding_power: 0,
        }
    }
}
