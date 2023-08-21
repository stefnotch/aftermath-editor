use input_tree::node::InputNode;
use syntax_tree::SyntaxNode;

pub mod autocomplete;
mod greedy_choice;
pub mod rule_collection;
pub mod syntax_tree;

// Oh look, it's a trait alias
pub trait TokenParser<'a>: chumsky::Parser<'a, &'a [InputNode], SyntaxNode> {}
impl<'a, T> TokenParser<'a> for T where T: chumsky::Parser<'a, &'a [InputNode], SyntaxNode> {}
