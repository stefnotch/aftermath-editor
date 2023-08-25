use input_tree::node::InputNode;
use syntax_tree::SyntaxNode;

pub mod autocomplete;
mod greedy_choice;
pub mod parser;
pub mod rule_collection;
pub mod rule_collections;
pub mod syntax_tree;

pub type TokenParserExtra = chumsky::extra::Default;
// Oh look, it's a trait alias
pub trait TokenParser<'a>:
    chumsky::Parser<'a, &'a [InputNode], SyntaxNode, TokenParserExtra>
{
}
impl<'a, T> TokenParser<'a> for T where
    T: chumsky::Parser<'a, &'a [InputNode], SyntaxNode, TokenParserExtra>
{
}

pub type BoxedTokenParser<'a, 'b> =
    chumsky::Boxed<'a, 'b, &'a [InputNode], SyntaxNode, TokenParserExtra>;
