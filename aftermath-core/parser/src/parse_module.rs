use std::rc::Rc;

use crate::{
    autocomplete::AutocompleteRule, make_parser::MakeParser, syntax_tree::SyntaxNodeNameId,
};

pub trait ParseModule {
    /// Used to retrieve a given module after it has been registered.
    fn get_module_name(&self) -> &str;

    fn get_rules(&self) -> &[ParseRule];

    fn get_autocomplete_rules(&self) -> &[AutocompleteRule];

    fn boxed(self) -> BoxedParseModule
    where
        Self: Sized + 'static,
    {
        BoxedParseModule::new(Rc::new(self))
    }
}

pub enum ParseRule {
    /// A rule that is created elsewhere, and we just want the name to show up.
    NameOnly(SyntaxNodeNameId),
    Atom(SyntaxNodeNameId, Box<dyn MakeParser>),
    Prefix(SyntaxNodeNameId, u16, Box<dyn MakeParser>),
    LeftInfix(SyntaxNodeNameId, u16, Box<dyn MakeParser>),
    RightInfix(SyntaxNodeNameId, u16, Box<dyn MakeParser>),
    Postfix(SyntaxNodeNameId, u16, Box<dyn MakeParser>),
    /// A rule for error recovery. Will never result in a syntax node.
    RecoveryEnding(Box<dyn MakeParser>),
}
impl ParseRule {
    pub fn rule_name(&self) -> Option<&SyntaxNodeNameId> {
        match self {
            ParseRule::NameOnly(name) => Some(name),
            ParseRule::Atom(name, _) => Some(name),
            ParseRule::Prefix(name, _, _) => Some(name),
            ParseRule::LeftInfix(name, _, _) => Some(name),
            ParseRule::RightInfix(name, _, _) => Some(name),
            ParseRule::Postfix(name, _, _) => Some(name),
            ParseRule::RecoveryEnding(_) => None,
        }
    }
}

pub fn name_only_rule(name: SyntaxNodeNameId) -> ParseRule {
    ParseRule::NameOnly(name)
}

pub fn atom_rule(name: SyntaxNodeNameId, parser: impl MakeParser + 'static) -> ParseRule {
    ParseRule::Atom(name, Box::new(parser))
}

pub fn prefix_rule(
    name: SyntaxNodeNameId,
    priority: u16,
    parser: impl MakeParser + 'static,
) -> ParseRule {
    ParseRule::Prefix(name, priority, Box::new(parser))
}

pub fn left_infix_rule(
    name: SyntaxNodeNameId,
    priority: u16,
    parser: impl MakeParser + 'static,
) -> ParseRule {
    ParseRule::LeftInfix(name, priority, Box::new(parser))
}

pub fn right_infix_rule(
    name: SyntaxNodeNameId,
    priority: u16,
    parser: impl MakeParser + 'static,
) -> ParseRule {
    ParseRule::RightInfix(name, priority, Box::new(parser))
}

pub fn postfix_rule(
    name: SyntaxNodeNameId,
    priority: u16,
    parser: impl MakeParser + 'static,
) -> ParseRule {
    ParseRule::Postfix(name, priority, Box::new(parser))
}

pub fn recovery_ending_rule(parser: impl MakeParser + 'static) -> ParseRule {
    ParseRule::RecoveryEnding(Box::new(parser))
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

#[cfg_attr(feature = "wasm", wasm_bindgen::prelude::wasm_bindgen)]
pub struct BoxedParseModule {
    parse_module: Rc<dyn ParseModule>,
}

impl BoxedParseModule {
    pub fn new(parse_module: Rc<dyn ParseModule>) -> Self {
        Self { parse_module }
    }

    pub fn get_module(&self) -> Rc<dyn ParseModule> {
        self.parse_module.clone()
    }
}

impl Clone for BoxedParseModule {
    fn clone(&self) -> Self {
        Self {
            parse_module: self.parse_module.clone(),
        }
    }
}
