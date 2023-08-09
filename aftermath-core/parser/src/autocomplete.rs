use input_tree::node::InputNode;
use serde::{Deserialize, Serialize};

use crate::token_matcher::MatchResult;

/// Can be empty when no rules matched
pub struct AutocompleteRuleMatches<'a>(pub Vec<AutocompleteRuleMatch<'a>>);

impl AutocompleteRuleMatches<'_> {
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl Default for AutocompleteRuleMatches<'_> {
    fn default() -> Self {
        Self(Vec::new())
    }
}

pub struct AutocompleteRuleMatch<'a> {
    pub rule: &'a AutocompleteRule,
    /// How much of the rule value was matched
    pub match_length: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct AutocompleteRule {
    pub value: String, // Could just as well be a vector of input nodes, or a regex, or something
    pub result: Vec<InputNode>,
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
