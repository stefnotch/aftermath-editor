use std::ops::Range;

use input_tree::input_node::InputNode;
use serde::Serialize;

use crate::token_matcher::MatchResult;

#[derive(Serialize)]
pub struct AutocompleteResult<'a> {
    pub range_in_input: Range<usize>,
    /// Can also be empty if there are no rules that match
    pub potential_rules: Vec<AutocompleteRuleMatch<'a>>,
}

#[derive(Serialize)]
pub struct AutocompleteRuleMatch<'a> {
    pub rule: &'a AutocompleteRule,
    /// How much of the rule value was matched
    pub match_length: usize,
}

#[derive(Serialize)]
pub struct AutocompleteRule {
    pub result: Vec<InputNode>,
    pub value: String, // Could just as well be a vector of input nodes, or a regex, or something
}

impl AutocompleteRule {
    pub fn new(result: Vec<InputNode>, value: impl Into<String>) -> Self {
        Self {
            result,
            value: value.into(),
        }
    }

    /// Match as much of the input as possible, and use up all of the self.value
    pub fn matches<'a>(&self, input: &'a [InputNode]) -> Option<MatchResult<'a, InputNode>> {
        let mut i = 0;
        for (index, node) in input.iter().enumerate() {
            match node {
                InputNode::Container { .. } => return None,
                InputNode::Symbol(symbol) => {
                    if Some(symbol.as_str()) != self.value.get(i..(i + symbol.len())) {
                        return None;
                    }
                    i += symbol.len();
                }
            };

            if i >= self.value.len() {
                return Some(MatchResult::new(&input[0..=index]));
            }
        }

        return None;
    }

    /// Match all of the input, and use up as much of self.value as possible
    pub fn this_starts_with_input<'a>(
        &'a self,
        input: &[InputNode],
    ) -> Option<MatchResult<'a, u8>> {
        let mut i = 0;
        for node in input {
            match node {
                InputNode::Container { .. } => return None,
                InputNode::Symbol(symbol) => {
                    if Some(symbol.as_str()) != self.value.get(i..(i + symbol.len())) {
                        return None;
                    }
                    i += symbol.len();
                }
            };
        }

        return Some(MatchResult::new(
            &self.value[0..self.value.len().min(i)].as_bytes(),
        ));
    }
}
