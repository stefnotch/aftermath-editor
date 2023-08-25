use crate::{autocomplete::AutocompleteRule, syntax_tree::NodeIdentifier, BoxedTokenParser};

pub struct InputPhantom<'a> {
    phantom_data: std::marker::PhantomData<&'a ()>,
}

impl InputPhantom<'_> {
    pub fn new<'a>() -> InputPhantom<'a> {
        InputPhantom {
            phantom_data: std::marker::PhantomData,
        }
    }
}

pub struct TokenRule {
    pub name: NodeIdentifier,
    /// (None, None) is a constant\
    /// (None, Some) is a prefix operator\
    /// (Some, None) is a postfix operator\
    /// (Some, Some) is an infix operator
    pub binding_power: (Option<u8>, Option<u8>),

    /// Parser for the token. Is greedy, as in the longest one that matches will win.
    /// This is needed for ">=" instead of ">""
    pub make_parser: for<'a> fn(&TokenRule, input: InputPhantom<'a>) -> BoxedTokenParser<'a, 'a>,
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
    Prefix(u8),
    Postfix(u8),
    LeftInfix(u8),
    RightInfix(u8),
}

impl TokenRule {
    pub fn binding_power_type(&self) -> BindingPowerType {
        use BindingPowerType::*;
        match self.binding_power {
            (None, None) => Atom,
            (None, Some(a)) => Prefix(a),
            (Some(a), None) => Postfix(a),
            (Some(a), Some(b)) => {
                if a <= b {
                    LeftInfix(a)
                } else {
                    RightInfix(b)
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
    fn get_rule_names() -> Vec<NodeIdentifier> {
        let mut rules_names = Self::get_rules()
            .into_iter()
            .map(|v| v.name)
            .collect::<Vec<_>>();
        rules_names.extend(Self::get_extra_rule_names());
        rules_names
    }
}
