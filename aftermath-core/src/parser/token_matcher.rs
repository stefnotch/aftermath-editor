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
// TODO: Build a DFA
// TODO: Have fast paths for some things (profile first)

use std::fmt::{Debug, Formatter};
use std::{collections::HashSet, ops::RangeInclusive};

use crate::math_layout::element::MathElement;

use super::grapheme_matcher::GraphemeClusterMatcher;

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
    GraphemeCluster(GraphemeClusterMatcher),
    Container(Container),
}
impl MatchIf {
    // TODO: Return an error (expected ... but got ...)
    fn matches(&self, value: &MathElement) -> bool {
        match (self, value) {
            (MatchIf::Container(Container::Fraction(matcher)), MathElement::Fraction(a))
            | (MatchIf::Container(Container::Root(matcher)), MathElement::Root(a))
            | (MatchIf::Container(Container::Under(matcher)), MathElement::Under(a))
            | (MatchIf::Container(Container::Over(matcher)), MathElement::Over(a)) => matcher
                .iter()
                .zip(a)
                .all(|(a, b)| a.matches(&b.values) == b.values.len()),

            (MatchIf::Container(Container::Sup(a)), MathElement::Sup(b))
            | (MatchIf::Container(Container::Sub(a)), MathElement::Sub(b)) => {
                a.matches(&b.values) == b.values.len()
            }
            (
                MatchIf::Container(Container::Table {
                    cells: matcher,
                    row_width,
                }),
                MathElement::Table {
                    cells: a,
                    row_width: b,
                },
            ) => matcher
                .iter()
                .zip(a)
                .all(|(a, b)| a.matches(&b.values) == b.values.len()),
            (MatchIf::GraphemeCluster(matcher), MathElement::Symbol(a)) => matcher.matches(a),
            (_, _) => false,
        }
    }
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

impl NFA {
    pub fn new(states: Vec<StateFragment>, start_state: StateId) -> Self {
        Self {
            states,
            start_state,
        }
    }

    pub fn matches(&self, input: &[MathElement]) -> usize {
        let mut current_states: HashSet<StateId> = HashSet::new();
        let mut best_final_states: BestMatches = BestMatches::new(0);
        self.add_state(
            &mut current_states,
            &mut best_final_states,
            self.start_state,
        );

        for (index, value) in input.iter().enumerate() {
            let mut next_states: HashSet<StateId> = HashSet::new();
            let mut next_final_states: BestMatches = BestMatches::new(index + 1);

            for state_id in current_states {
                // The invariant here is that we only added MatchIf states
                let state = self.states.get(state_id).unwrap();
                match state {
                    StateFragment::Match(match_if, next_state) => {
                        if match_if.matches(value) {
                            self.add_state(&mut next_states, &mut next_final_states, *next_state);
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
                assert!(next_final_states.length > best_final_states.length);
                best_final_states = next_final_states;
            }
        }

        if best_final_states.length > 0 {
            // TODO: Return something more useful
            // And maybe report the ambiguity?
            return best_final_states.length;
        } else {
            return 0;
        }
    }

    fn add_state(
        &self,
        state_set: &mut HashSet<StateId>,
        final_states: &mut BestMatches,
        state: StateId,
    ) {
        match self.states.get(state) {
            Some(StateFragment::Final) => {
                final_states.insert(state);
            }
            Some(StateFragment::Match(_, _)) => {
                state_set.insert(state);
            }
            Some(StateFragment::Split(a, b)) => {
                // follow the epsilon transitions
                // and insert the states they lead to instead of this one
                self.add_state(state_set, final_states, *a);
                self.add_state(state_set, final_states, *b);
            }
            None => {
                panic!("State {:?} does not exist", state);
            }
        }
    }
}

struct BestMatches {
    states: HashSet<StateId>,
    length: usize,
}
impl BestMatches {
    fn new(length: usize) -> BestMatches {
        BestMatches {
            states: HashSet::new(),
            length,
        }
    }

    fn insert(&mut self, state: StateId) {
        self.states.insert(state);
    }

    fn has_matches(&self) -> bool {
        self.states.len() > 0
    }
}

mod tests {
    use crate::parser::nfa_builder::*;

    use super::*;

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
            ]),
            2
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
            ]),
            4
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
            ]),
            4
        );
    }
}
