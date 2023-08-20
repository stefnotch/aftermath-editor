use std::collections::HashSet;

use super::StateId;

#[derive(Debug, Clone)]
pub struct NFAMatches {
    states: HashSet<StateId>,
    input_length: usize,
}

impl NFAMatches {
    pub fn new(input_length: usize) -> Self {
        Self {
            states: HashSet::new(),
            input_length,
        }
    }

    pub fn add_next_state(&mut self, new_state: StateId) {
        self.states.insert(new_state);
    }

    pub fn has_matches(&self) -> bool {
        self.states.len() > 0
    }

    pub fn input_length(&self) -> usize {
        self.input_length
    }

    pub fn get_match_result<'input, Input>(
        &self,
        input: &'input [Input],
    ) -> Result<MatchResult<'input, Input>, MatchError> {
        assert_eq!(input.len(), self.input_length);

        if self.input_length == 0 {
            Err(MatchError::NoMatch)
        } else if self.states.len() == 0 {
            Err(MatchError::NoMatch)
        } else if self.states.len() > 1 {
            Err(MatchError::MultipleMatches) // Reached multiple final states. TODO: Should this even be an error?
        } else {
            let _ = self.states.iter().next().unwrap();
            Ok(MatchResult::new(input))
        }
    }
}

#[derive(Debug)]
pub struct MatchResult<'input, Input> {
    matched: &'input [Input],
}

impl<'input, Input> MatchResult<'input, Input> {
    pub fn new(matched: &'input [Input]) -> Self {
        Self { matched }
    }

    pub fn get_length(&self) -> usize {
        self.matched.len()
    }
}

#[derive(Debug, Eq, PartialEq)]
pub enum MatchError {
    NoMatch,
    MultipleMatches,
}

impl IntoIterator for NFAMatches {
    type Item = StateId;
    type IntoIter = std::collections::hash_set::IntoIter<StateId>;

    fn into_iter(self) -> Self::IntoIter {
        self.states.into_iter()
    }
}
