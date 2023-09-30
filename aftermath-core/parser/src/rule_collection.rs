use std::collections::HashSet;

use chumsky::{span::SimpleSpan, IterParser, Parser};
use input_tree::node::InputNode;

use crate::{
    autocomplete::AutocompleteRule,
    parser::pratt_parselet::PrattParselet,
    parser_debug_error::ParserDebugError,
    rule_collections::built_in_rules::BuiltInRules,
    syntax_tree::{LeafNodeType, NodeIdentifier, SyntaxNode, SyntaxNodeBuilder},
};

pub type ParserInput<'a> = &'a [InputNode];

// chumsky::prelude::Cheap
pub type BasicParserExtra = chumsky::extra::Full<ParserDebugError<InputNode>, (), ()>;

// Oh look, it's a trait alias
pub trait TokenParser<'a>:
    chumsky::Parser<'a, ParserInput<'a>, SyntaxNodeBuilder, BasicParserExtra>
{
}
impl<'a, T> TokenParser<'a> for T where
    T: chumsky::Parser<'a, ParserInput<'a>, SyntaxNodeBuilder, BasicParserExtra>
{
}

pub type BoxedTokenParser<'a, 'b> =
    chumsky::Boxed<'a, 'b, ParserInput<'a>, SyntaxNodeBuilder, BasicParserExtra>;

// TODO: This should not be able to return any errors.
pub type BoxedNodeParser<'a, 'b> =
    chumsky::Boxed<'a, 'b, ParserInput<'a>, SyntaxNode, BasicParserExtra>;

pub struct TokenRule<'a, 'b> {
    /// If the match isn't what the user intended, the user can use spaces to separate the tokens.
    /// Tokens can also be escaped using a backslash \.
    /// \x basically means "this has a very specific meaning", such as \| always being a | symbol, and \sum always being a sum symbol.
    /// The parser is a recursive parser, which can be used to parse nested expressions.
    ///
    pub parselet:
        PrattParselet<BoxedTokenParser<'a, 'b>, SyntaxNodeBuilder, SyntaxNode, NodeIdentifier>,
    // Maybe introduce a concept of "priority"
    // When two things match, the one with the highest priority wins
    // e.g. "lim" and "variable parser" both match "lim"
    //
    // We roughly model this by:
    // 1. Insert parse collections in order.
    // 2. Do a choice backwards. Later parse collections take priority.
    // This is somewhat different from what we used to have. The
    // previous logic did "apply all parsers, do greedy" followed by
    // "do parser priority".
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BindingPowerType {
    Atom,
    Prefix(u16),
    Postfix(u16),
    LeftInfix(u16),
    RightInfix(u16),
}

impl<'a, 'b> TokenRule<'a, 'b> {
    pub fn new(
        parselet: PrattParselet<
            BoxedTokenParser<'a, 'b>,
            SyntaxNodeBuilder,
            SyntaxNode,
            NodeIdentifier,
        >,
    ) -> Self {
        Self { parselet }
    }

    pub fn new_atom(name: NodeIdentifier, parser: BoxedTokenParser<'a, 'b>) -> TokenRule<'a, 'b> {
        Self::new(PrattParselet::new_atom(parser, |v, extra| {}, name))
    }
}

fn make_space_parser() -> impl Parser<'static, ParserInput<'static>, Option<SyntaxNode>> {
    chumsky::select_ref! {
      input_tree::node::InputNode::Symbol(v) if v == " " => v.clone(),
    }
    .repeated()
    .collect::<Vec<_>>()
    .map_with_span(|v, range: SimpleSpan| {
        if v.len() > 0 {
            Some(
                SyntaxNodeBuilder::new_leaf_node(v, LeafNodeType::Operator)
                    .build(BuiltInRules::whitespace_rule_name(), range.into_range()),
            )
        } else {
            None
        }
    })
}

pub trait RuleCollection<'a, 'b> {
    fn get_rules() -> Vec<TokenRule<'static, 'static>>;
    fn get_autocomplete_rules() -> Vec<AutocompleteRule>;
    fn get_extra_rule_names() -> Vec<NodeIdentifier> {
        vec![]
    }
    fn get_rule_names() -> HashSet<NodeIdentifier> {
        let mut rules_names = Self::get_rules()
            .into_iter()
            .map(|v| v.parselet.extra)
            .collect::<HashSet<_>>();
        rules_names.extend(Self::get_extra_rule_names());
        rules_names
    }
}
