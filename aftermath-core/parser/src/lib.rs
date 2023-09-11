use input_tree::node::InputNode;

pub mod autocomplete;
mod greedy_choice;
pub mod make_parser;
pub mod parser;
pub mod parser_extensions;
pub mod rule_collection;
pub mod rule_collections;
pub mod syntax_tree;

pub type TokenParserInput<'a> = &'a [InputNode];
pub type TokenParserError = chumsky::prelude::Cheap;
pub type TokenParserExtra = chumsky::extra::Err<TokenParserError>;
