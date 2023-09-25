use input_tree::node::InputNode;
use parser::pratt_parser::PrattParseContext;
use parser_debug_error::ParserDebugError;

pub mod autocomplete;
pub mod make_parser;
pub mod parser;
pub mod parser_debug_error;
pub mod parser_extensions;
pub mod rule_collection;
pub mod rule_collections;
pub mod syntax_tree;

pub type ParserInput<'a> = &'a [InputNode];

// chumsky::prelude::Cheap
pub type NodeParserExtra<'a> =
    chumsky::extra::Full<ParserDebugError<InputNode>, (), PrattParseContext>;
