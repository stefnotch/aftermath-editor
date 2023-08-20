use crate::{syntax_tree::NodeIdentifier, TokenParser};

pub struct TokenRule<'a> {
    pub name: NodeIdentifier,
    /// (None, None) is a constant\
    /// (None, Some) is a prefix operator\
    /// (Some, None) is a postfix operator\
    /// (Some, Some) is an infix operator
    pub binding_power: (Option<u32>, Option<u32>),

    /// Parser for the token. Is greedy, as in the longest one that matches will win.
    /// This is needed for ">=" instead of ">""
    pub parser: Box<dyn TokenParser<'a>>,
    // Maybe introduce a concept of "priority"
    // When two things match, the one with the highest priority wins
    // e.g. "lim" and "variable parser" both match "lim"
    //
    // We roughly model this by:
    // 1. Insert parse collections in order.
    // 2. Do a choice backwards. Later parse collections take priority.
    // This is somewhat different from what we used to have. The
    // previous logic did "apply all parsers" followed by
    // "do parser priority".
}

pub trait RuleCollection<'a> {
    fn get_rules() -> Vec<TokenRule<'a>>;
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
