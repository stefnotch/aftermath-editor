// TODO:
// - "text in quotes but not with escaped \" quotes"
//    - parser's job: As in, the lexer will recognise the starting quote,
//      and then the parser will create a new parsing context for the string, which
//      encodes all those letter rules. The lexer there won't do anything special.

// See https://swtch.com/~rsc/regexp/regexp1.html
// https://swtch.com/~rsc/regexp/regexp2.html
// https://swtch.com/~rsc/regexp/regexp3.html
// TODO: Have fast path (trie) for some things (profile first)

mod matcher_state;

use std::fmt::{Debug, Formatter};

use input_tree::node::{InputNode, InputNodeVariant};

use super::grapheme_matcher::GraphemeMatcher;
use super::token_matcher::matcher_state::NFAMatches;

pub(super) use super::token_matcher::matcher_state::{MatchError, MatchResult};

// TODO: Error prone
pub type StateId = usize;

pub struct NFA {
    pub states: Vec<StateFragment>,
    pub start_state: StateId,
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
    /// A final state
    /// TODO: Add some ID to this, so that if we construct an NFA from multiple NFAs, we can still tell which one it is
    Final,
}

#[derive(Debug)]
pub enum MatchIf {
    GraphemeCluster(GraphemeMatcher),
    InputNode(InputNodeVariant),
    Any,
}

impl MatchIf {
    fn matches(&self, value: &InputNode) -> bool {
        match (self, value) {
            (MatchIf::GraphemeCluster(matcher), InputNode::Symbol(a)) => matcher.matches(a),
            (MatchIf::InputNode(node_type), InputNode::Container(container_type, _)) => {
                container_type == node_type
            }
            (MatchIf::Any, _) => true,
            (_, _) => false,
        }
    }
}

impl NFA {
    pub fn new(states: Vec<StateFragment>, start_state: StateId) -> Self {
        Self {
            states,
            start_state,
        }
    }

    pub fn matches<'input>(
        &self,
        input: &'input [InputNode],
    ) -> Result<MatchResult<'input, InputNode>, MatchError> {
        let mut current_states = NFAMatches::new(0);
        let mut best_final_states = NFAMatches::new(0);
        {
            self.add_state(
                0,
                &mut current_states,
                &mut best_final_states,
                self.start_state,
            );
        }

        for (index, value) in input.iter().enumerate() {
            let input_length = index + 1;
            let mut next_states = NFAMatches::new(input_length);
            let mut next_final_states = NFAMatches::new(input_length);

            for state_id in current_states {
                // The invariant here is that we only added MatchIf states
                let state = self.states.get(state_id).unwrap();
                match state {
                    StateFragment::Match(match_if, next_state) => {
                        if match_if.matches(value) {
                            self.add_state(
                                index,
                                &mut next_states,
                                &mut next_final_states,
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
        state: StateId,
    ) {
        match self.states.get(state) {
            Some(StateFragment::Final) => {
                final_states.add_next_state(state);
            }
            Some(StateFragment::Match(_, _)) => {
                state_set.add_next_state(state);
            }
            Some(StateFragment::Split(a, b)) => {
                // follow the epsilon transitions
                // and insert the states they lead to instead of this one
                self.add_state(input_index, state_set, final_states, *a);
                self.add_state(input_index, state_set, final_states, *b);
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
                InputNode::Symbol("a".into()),
                InputNode::Symbol("0".into()),
                InputNode::Symbol("0".into())
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
                InputNode::Symbol("9".into()),
                InputNode::Symbol("3".into()),
                InputNode::Symbol("0".into()),
                InputNode::Symbol("a".into()),
                InputNode::Symbol("a".into())
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
                InputNode::Symbol("b".into()),
                InputNode::Symbol("b".into()),
                InputNode::Symbol("b".into()),
                InputNode::Symbol("2".into()),
                InputNode::Symbol("0".into())
            ])
            .map(|x| x.get_length()),
            Ok(4)
        );
    }
}
