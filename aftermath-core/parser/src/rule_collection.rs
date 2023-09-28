use std::collections::HashSet;

use input_tree::node::InputNode;

use crate::{
    autocomplete::AutocompleteRule,
    make_parser::MakeParser,
    parser::pratt_parser::PrattParseContext,
    parser_debug_error::ParserDebugError,
    syntax_tree::{NodeIdentifier, SyntaxNode, SyntaxNodeBuilder},
};

pub type ParserInput<'a> = &'a [InputNode];

pub type ParseContext<'a> =
    PrattParseContext<chumsky::Boxed<'a, 'a, ParserInput<'a>, (), BasicParserExtra>>;

// chumsky::prelude::Cheap
type BasicParserExtra = chumsky::extra::Full<ParserDebugError<InputNode>, (), ()>;
pub type ContextualParserExtra<'a> =
    chumsky::extra::Full<ParserDebugError<InputNode>, (), ParseContext<'a>>;

// Oh look, it's a trait alias
pub trait TokenParser<'a>:
    chumsky::Parser<'a, ParserInput<'a>, SyntaxNodeBuilder, ContextualParserExtra<'a>>
{
}
impl<'a, T> TokenParser<'a> for T where
    T: chumsky::Parser<'a, ParserInput<'a>, SyntaxNodeBuilder, ContextualParserExtra<'a>>
{
}

pub type BoxedTokenParser<'a, 'b> =
    chumsky::Boxed<'a, 'b, ParserInput<'a>, SyntaxNodeBuilder, ContextualParserExtra<'a>>;

// TODO: This should not be able to return any errors.
pub type BoxedNodeParser<'a, 'b> =
    chumsky::Boxed<'a, 'b, ParserInput<'a>, SyntaxNode, ContextualParserExtra<'a>>;

pub struct TokenRule {
    pub name: NodeIdentifier,
    /// (None, None) is a constant\
    /// (None, Some) is a prefix operator\
    /// (Some, None) is a postfix operator\
    /// (Some, Some) is an infix operator
    pub binding_power: (Option<u16>, Option<u16>),

    /// Parser for the token. Is greedy, as in the longest one that matches will win.
    /// This is needed for ">=" instead of ">" and "=".
    /// If the match isn't what the user intended, the user can use spaces to separate the tokens.
    /// Tokens can also be escaped using a backslash \.
    /// \x basically means "this has a very specific meaning", such as \| always being a | symbol, and \sum always being a sum symbol.
    /// The parser is a recursive parser, which can be used to parse nested expressions.
    pub make_parser: Box<dyn MakeParser>,
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

impl TokenRule {
    pub fn new(
        name: NodeIdentifier,
        binding_power: (Option<u16>, Option<u16>),
        make_parser: impl MakeParser + 'static,
    ) -> Self {
        Self {
            name,
            binding_power,
            make_parser: Box::new(make_parser),
        }
    }
    pub fn binding_power_type(&self) -> BindingPowerType {
        match self.binding_power {
            (None, None) => BindingPowerType::Atom,
            (None, Some(a)) => BindingPowerType::Prefix(a),
            (Some(a), None) => BindingPowerType::Postfix(a),
            (Some(a), Some(b)) => {
                if a <= b {
                    BindingPowerType::LeftInfix(a)
                } else {
                    BindingPowerType::RightInfix(b)
                }
            }
        }
    }
}

pub trait RuleCollection {
    fn get_rules() -> Vec<TokenRule>;
    fn get_autocomplete_rules() -> Vec<AutocompleteRule>;
    fn get_extra_rule_names() -> Vec<NodeIdentifier> {
        vec![]
    }
    fn get_rule_names() -> HashSet<NodeIdentifier> {
        let mut rules_names = Self::get_rules()
            .into_iter()
            .map(|v| v.name)
            .collect::<HashSet<_>>();
        rules_names.extend(Self::get_extra_rule_names());
        rules_names
    }
}
