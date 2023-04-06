// TODO:
// - exact matches (sin, lim sup, etc.)
// - ignore (like the bottom part of lim)
// - regex-like matching (like /\d+(\.\d+)?/)
//   - numbers
//   - hex numbers
//   - unknown identifier
//   - disambiguation like this https://github.com/maciejhirsz/logos#token-disambiguation
// - "text in quotes but not with escaped \" quotes"
//    - parser's job: As in, the lexer will recognise the starting quote,
//      and then the parser will create a new parsing context for the string, which
//      encodes all those letter rules. The lexer there won't do anything special.
// - unicode properties (e.g. "greek letter") https://unicode.org/reports/tr18/#examples_of_properties

// See https://swtch.com/~rsc/regexp/regexp1.html
// https://swtch.com/~rsc/regexp/regexp2.html
// https://swtch.com/~rsc/regexp/regexp3.html
// TODO: Build a DFA
// TODO: Have fast paths for some things (profile first)

mod capturing_group;
mod matcher_state;

use std::fmt::{Debug, Formatter};

use math_layout::element::MathElement;

use super::grapheme_matcher::GraphemeClusterMatcher;
use super::token_matcher::matcher_state::{MatchInfo, NFAMatches};

pub(super) use super::token_matcher::capturing_group::CapturingGroupId;
pub(super) use super::token_matcher::capturing_group::CapturingGroups;
pub(super) use super::token_matcher::matcher_state::{MatchError, MatchResult};

// TODO: Error prone
pub type StateId = usize;

pub struct NFA {
    pub states: Vec<StateFragment>,
    pub start_state: StateId,
    pub capturing_groups: CapturingGroups,
}

impl Debug for NFA {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NFA")
            .field("states", &self.states)
            .field("start_state", &self.start_state)
            .finish()
    }
}

#[derive(Debug)]
pub enum StateFragment {
    /// A state, followed by a match arrow
    Match(MatchIf, StateId),
    /// A state that splits into two different states (with epsilon transitions)
    /// TODO: The following invariant might be useful: Only the second state can be a final state.
    Split(StateId, StateId),
    CaptureStart(StateId, CapturingGroupId),
    CaptureEnd(StateId, CapturingGroupId),
    /// A final state
    /// TODO: Add some ID to this, so that if we construct an NFA from multiple NFAs, we can still tell which one it is
    Final,
}

#[derive(Debug)]
pub enum MatchIf {
    GraphemeCluster(GraphemeClusterMatcher),
    Container(Container),
}

#[derive(Debug)]
pub enum Container {
    Fraction([NFA; 2]),
    Root([NFA; 2]),
    Under([NFA; 2]),
    Over([NFA; 2]),
    Sup(NFA),
    Sub(NFA),
    Table { cells: Vec<NFA>, row_width: usize },
}

impl MatchIf {
    fn matches_all(matcher: &NFA, values: &[MathElement]) -> bool {
        match matcher.matches(values) {
            Ok(result) => result.get_length() == values.len(),
            Err(_) => false,
        }
    }

    fn matches(&self, value: &MathElement) -> bool {
        match (self, value) {
            (MatchIf::Container(Container::Fraction(matcher)), MathElement::Fraction(a))
            | (MatchIf::Container(Container::Root(matcher)), MathElement::Root(a))
            | (MatchIf::Container(Container::Under(matcher)), MathElement::Under(a))
            | (MatchIf::Container(Container::Over(matcher)), MathElement::Over(a)) => matcher
                .iter()
                .zip(a)
                .all(|(a, b)| Self::matches_all(a, &b.values)),

            (MatchIf::Container(Container::Sup(a)), MathElement::Sup(b))
            | (MatchIf::Container(Container::Sub(a)), MathElement::Sub(b)) => {
                Self::matches_all(a, &b.values)
            }
            (
                MatchIf::Container(Container::Table {
                    cells: matcher,
                    row_width: _,
                }),
                MathElement::Table {
                    cells: a,
                    row_width: _,
                },
            ) => matcher
                .iter()
                .zip(a)
                .all(|(a, b)| Self::matches_all(a, &b.values)),
            (MatchIf::GraphemeCluster(matcher), MathElement::Symbol(a)) => matcher.matches(a),
            (_, _) => false,
        }
    }
}

impl NFA {
    pub fn new(
        states: Vec<StateFragment>,
        start_state: StateId,
        capturing_groups: CapturingGroups,
    ) -> Self {
        Self {
            states,
            start_state,
            capturing_groups,
        }
    }

    pub fn matches<'input>(
        &self,
        input: &'input [MathElement],
    ) -> Result<MatchResult<'input, MathElement>, MatchError> {
        let mut current_states = NFAMatches::new(0);
        let mut best_final_states = NFAMatches::new(0);
        {
            let starting_match_info = MatchInfo::new(self.capturing_groups.count());
            self.add_state(
                0,
                &mut current_states,
                &mut best_final_states,
                starting_match_info,
                self.start_state,
            );
        }

        for (index, value) in input.iter().enumerate() {
            let input_length = index + 1;
            let mut next_states = NFAMatches::new(input_length);
            let mut next_final_states = NFAMatches::new(input_length);

            for (state_id, match_info) in current_states {
                // The invariant here is that we only added MatchIf states
                let state = self.states.get(state_id).unwrap();
                match state {
                    StateFragment::Match(match_if, next_state) => {
                        if match_if.matches(value) {
                            self.add_state(
                                index,
                                &mut next_states,
                                &mut next_final_states,
                                match_info.clone(),
                                *next_state,
                            );
                        }
                    }
                    StateFragment::Split(_, _) => {
                        panic!("Split states should not be in the current_states set")
                    }
                    StateFragment::Final => {
                        panic!("Final states should not be in the current_states set")
                    }
                    StateFragment::CaptureStart(_, _) => {
                        panic!("Capture start states should not be in the current_states set")
                    }
                    StateFragment::CaptureEnd(_, _) => {
                        panic!("Capture end states should not be in the current_states set")
                    }
                }
            }

            current_states = next_states;
            if next_final_states.has_matches() {
                best_final_states = next_final_states;
            }
        }

        return best_final_states.get_match_result(&(input[0..best_final_states.input_length()]));
    }

    fn add_state(
        &self,
        input_index: usize,
        state_set: &mut NFAMatches,
        final_states: &mut NFAMatches,
        mut match_info: MatchInfo,
        state: StateId,
    ) {
        match self.states.get(state) {
            Some(StateFragment::Final) => {
                final_states.add_next_state((state, match_info));
            }
            Some(StateFragment::Match(_, _)) => {
                state_set.add_next_state((state, match_info));
            }
            Some(StateFragment::Split(a, b)) => {
                // follow the epsilon transitions
                // and insert the states they lead to instead of this one
                self.add_state(input_index, state_set, final_states, match_info.clone(), *a);
                self.add_state(input_index, state_set, final_states, match_info, *b);
            }
            Some(StateFragment::CaptureStart(a, group)) => {
                match_info.start_capture(group, input_index);
                self.add_state(input_index, state_set, final_states, match_info, *a);
            }
            Some(StateFragment::CaptureEnd(a, group)) => {
                match_info.end_capture(group, input_index);
                self.add_state(input_index, state_set, final_states, match_info, *a);
            }
            None => {
                panic!("State {:?} does not exist", state);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nfa_builder::*;

    #[test]
    fn test_matches() {
        let nfa = NFABuilder::match_character('a'.into())
            .then_character(('0'..='9').into())
            .build();
        assert_eq!(
            nfa.matches(&[
                MathElement::Symbol("a".into()),
                MathElement::Symbol("0".into()),
                MathElement::Symbol("0".into())
            ])
            .map(|x| x.get_length()),
            Ok(2)
        );
    }

    #[test]
    fn test_matches_with_one_or_more() {
        let nfa = NFABuilder::match_character(('0'..='9').into())
            .one_or_more()
            .then_character('a'.into())
            .build();
        assert_eq!(
            nfa.matches(&[
                MathElement::Symbol("9".into()),
                MathElement::Symbol("3".into()),
                MathElement::Symbol("0".into()),
                MathElement::Symbol("a".into()),
                MathElement::Symbol("a".into())
            ])
            .map(|x| x.get_length()),
            Ok(4)
        );
    }

    #[test]
    fn test_matches_with_split() {
        let nfa = NFABuilder::match_character('a'.into())
            .one_or_more()
            .or(NFABuilder::match_character('b'.into())
                .one_or_more()
                .then_character(('0'..='9').into()))
            .build();
        assert_eq!(
            nfa.matches(&[
                MathElement::Symbol("b".into()),
                MathElement::Symbol("b".into()),
                MathElement::Symbol("b".into()),
                MathElement::Symbol("2".into()),
                MathElement::Symbol("0".into())
            ])
            .map(|x| x.get_length()),
            Ok(4)
        );
    }
}
