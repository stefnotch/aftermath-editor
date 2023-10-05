use crate::{autocomplete::AutocompleteRule, make_parser::MakeParser, syntax_tree::PathIdentifier};

pub trait ParseModule {
    /// Used to retrieve a given module after it has been registered.
    fn get_module_name(&self) -> &PathIdentifier;

    fn get_rules(&self) -> &[ParseRule];

    fn get_autocomplete_rules(&self) -> &[AutocompleteRule];
}

pub enum ParseRule {
    /// A rule that is created elsewhere, and we just want the name to show up.
    NameOnly(PathIdentifier),
    /// A rule for error recovery. Will never result in a syntax node.
    RecoveryEnding(Box<dyn MakeParser>),
    Atom(PathIdentifier, Box<dyn MakeParser>),
    Prefix(PathIdentifier, u16, Box<dyn MakeParser>),
    LeftInfix(PathIdentifier, u16, Box<dyn MakeParser>),
    RightInfix(PathIdentifier, u16, Box<dyn MakeParser>),
    Postfix(PathIdentifier, u16, Box<dyn MakeParser>),
}

// Old notes:
// Parser for the token. Is greedy, as in the longest one that matches will win.
// This is needed for ">=" instead of ">" and "=".
// If the match isn't what the user intended, the user can use spaces to separate the tokens.
// Tokens can also be escaped using a backslash \.
// \x basically means "this has a very specific meaning", such as \| always being a | symbol, and \sum always being a sum symbol.
// The parser is a recursive parser, which can be used to parse nested expressions.
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
