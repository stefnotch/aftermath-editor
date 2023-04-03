use std::{collections::HashMap, ops::RangeInclusive};

use super::{capturing_group::CapturingGroupId, StateId};

#[derive(Debug, Clone)]
pub struct NFAMatches {
    states: HashMap<StateId, MatchInfo>,
    input_length: usize,
}

#[derive(Debug, Clone)]
pub struct MatchInfo {
    capture_ranges: Vec<RangeInclusive<usize>>,
}

impl NFAMatches {
    pub fn new(input_length: usize) -> Self {
        Self {
            states: HashMap::new(),
            input_length,
        }
    }

    pub fn add_next_state(&mut self, new_state: (StateId, MatchInfo)) {
        self.states.insert(new_state.0, new_state.1);
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
            Err(MatchError::MultipleMatches)
        } else {
            let (_, match_info) = self.states.iter().next().unwrap();
            Ok(MatchResult {
                length: self.input_length,
                capture_ranges: match_info.capture_ranges.clone(),
                input,
            })
        }
    }
}

#[derive(Debug)]
pub struct MatchResult<'input, Input> {
    length: usize,
    capture_ranges: Vec<RangeInclusive<usize>>,
    input: &'input [Input],
}

impl<'input, Input> MatchResult<'input, Input> {
    pub fn empty() -> Self {
        Self {
            length: 0,
            capture_ranges: Vec::new(),
            input: &[],
        }
    }

    pub fn get_length(&self) -> usize {
        self.length
    }
    pub fn get_input(&self) -> &'input [Input] {
        self.input
    }
    pub fn get_capture_group(&self, group: CapturingGroupId) -> Option<&'input [Input]> {
        self.capture_ranges
            .get(group.get())
            .map(|range| &self.input[range.clone()])
    }
}

#[derive(Debug, Eq, PartialEq)]
pub enum MatchError {
    NoMatch,
    MultipleMatches,
}

impl MatchInfo {
    pub fn new(capture_group_count: usize) -> Self {
        Self {
            // empty ranges
            capture_ranges: vec![1..=0; capture_group_count],
        }
    }

    pub fn set_capture_group_range(
        &mut self,
        capture_group: CapturingGroupId,
        range: RangeInclusive<usize>,
    ) {
        self.capture_ranges[capture_group.get()] = range;
    }

    pub fn start_capture(&mut self, group: &CapturingGroupId, index: usize) {
        self.capture_ranges[group.get()] = index..=index;
    }

    pub fn end_capture(&mut self, group: &CapturingGroupId, index: usize) {
        let range = self.capture_ranges[group.get()].clone();
        self.capture_ranges[group.get()] = *(range.start())..=index;
    }
}

impl IntoIterator for NFAMatches {
    type Item = (StateId, MatchInfo);
    type IntoIter = std::collections::hash_map::IntoIter<StateId, MatchInfo>;

    fn into_iter(self) -> Self::IntoIter {
        self.states.into_iter()
    }
}
