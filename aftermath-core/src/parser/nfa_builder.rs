use unicode_normalization::UnicodeNormalization;
use unicode_segmentation::UnicodeSegmentation;

use super::{
    grapheme_matcher::GraphemeClusterMatcher,
    token_matcher::{
        CapturingGroupId, CapturingGroups, Container, MatchIf, StateFragment, StateId, NFA,
    },
};

/// A builder for an NFA
#[derive(Debug)]
pub enum NFABuilder {
    GraphemeCluster(GraphemeClusterMatcher),
    Concat(Box<NFABuilder>, Box<NFABuilder>),
    Or(Box<NFABuilder>, Box<NFABuilder>),
    ZeroOrOne(Box<NFABuilder>),
    ZeroOrMore(Box<NFABuilder>),
    OneOrMore(Box<NFABuilder>),
    Capture(Box<NFABuilder>, CapturingGroupId),
    Container(Container),
}

impl NFABuilder {
    pub fn match_container(container: Container) -> NFABuilder {
        NFABuilder::Container(container)
    }

    pub fn match_character(character: GraphemeClusterMatcher) -> NFABuilder {
        NFABuilder::GraphemeCluster(character)
    }

    pub fn concat(self, right: NFABuilder) -> NFABuilder {
        NFABuilder::Concat(Box::new(self), Box::new(right))
    }

    pub fn or(self, right: NFABuilder) -> NFABuilder {
        NFABuilder::Or(Box::new(self), Box::new(right))
    }

    pub fn optional(self) -> NFABuilder {
        NFABuilder::ZeroOrOne(Box::new(self))
    }

    pub fn zero_or_more(self) -> NFABuilder {
        NFABuilder::ZeroOrMore(Box::new(self))
    }

    pub fn one_or_more(self) -> NFABuilder {
        NFABuilder::OneOrMore(Box::new(self))
    }

    pub fn then(self, right: NFABuilder) -> NFABuilder {
        self.concat(right)
    }

    pub fn then_container(self, container: Container) -> NFABuilder {
        self.concat(NFABuilder::Container(container))
    }

    pub fn then_character(self, character: GraphemeClusterMatcher) -> NFABuilder {
        self.concat(NFABuilder::match_character(character))
    }

    pub fn capturing_group<T>(self, id: CapturingGroupId) -> NFABuilder {
        NFABuilder::Capture(Box::new(self), id)
    }

    /// Matches a string and does Unicode handling (splitting into grapheme clusters followed by NFD-normalizing)
    pub fn match_string(pattern: &str) -> NFABuilder {
        let grapheme_matchers = pattern
            .graphemes(true)
            .map(|c| GraphemeClusterMatcher::new(c.nfd().map(|c| c.into())))
            .map(|c| NFABuilder::match_character(c));

        grapheme_matchers.reduce(|a, b| a.concat(b)).unwrap()
    }

    pub fn then_string(self, pattern: &str) -> NFABuilder {
        self.concat(NFABuilder::match_string(pattern))
    }
}

impl NFABuilder {
    pub fn build(self) -> NFA {
        let mut states = Vec::new();
        let mut capturing_groups = CapturingGroups::new();
        // A recursive builder is good enough for now
        // TODO: Make this iterative https://blog.moertel.com/posts/2013-05-11-recursive-to-iterative.html
        let builder_fragment = self.build_nfa(&mut states, &mut capturing_groups);
        let end_state = push_state(&mut states, StateFragment::Final);
        set_end_states(&mut states, builder_fragment.end_states, end_state);

        NFA::new(states, builder_fragment.start_state, capturing_groups)
    }

    fn build_nfa(
        self,
        states: &mut Vec<StateFragment>,
        capturing_groups: &mut CapturingGroups,
    ) -> NFABuilderFragment {
        match self {
            NFABuilder::GraphemeCluster(character) => {
                let start_state = push_state(
                    states,
                    StateFragment::Match(MatchIf::GraphemeCluster(character), 0),
                );
                NFABuilderFragment {
                    start_state,
                    end_states: vec![NFABuilderEndState::Match(start_state)],
                }
            }
            NFABuilder::Concat(a, b) => {
                let a = a.build_nfa(states, capturing_groups);
                let b = b.build_nfa(states, capturing_groups);

                set_end_states(states, a.end_states, b.start_state);

                NFABuilderFragment {
                    start_state: a.start_state,
                    end_states: b.end_states,
                }
            }
            NFABuilder::Or(a, b) => {
                let a = a.build_nfa(states, capturing_groups);
                let mut b = b.build_nfa(states, capturing_groups);

                let start_state =
                    push_state(states, StateFragment::Split(a.start_state, b.start_state));

                let mut end_states = a.end_states;
                end_states.append(&mut b.end_states);
                NFABuilderFragment {
                    start_state,
                    end_states,
                }
            }
            NFABuilder::ZeroOrOne(a) => {
                let a = a.build_nfa(states, capturing_groups);

                let start_state = push_state(states, StateFragment::Split(a.start_state, 0));

                let mut end_states = a.end_states;
                end_states.push(NFABuilderEndState::SplitB(start_state));
                NFABuilderFragment {
                    start_state,
                    end_states,
                }
            }
            NFABuilder::ZeroOrMore(a) => {
                let a = a.build_nfa(states, capturing_groups);

                let start_state = push_state(states, StateFragment::Split(a.start_state, 0));
                set_end_states(states, a.end_states, start_state);

                let end_states = vec![NFABuilderEndState::SplitB(start_state)];
                NFABuilderFragment {
                    start_state,
                    end_states,
                }
            }
            NFABuilder::OneOrMore(a) => {
                let a = a.build_nfa(states, capturing_groups);

                let loop_state = push_state(states, StateFragment::Split(a.start_state, 0));
                set_end_states(states, a.end_states, loop_state);

                let end_states = vec![NFABuilderEndState::SplitB(loop_state)];
                NFABuilderFragment {
                    start_state: a.start_state,
                    end_states,
                }
            }
            NFABuilder::Container(container) => {
                let start_state = push_state(
                    states,
                    StateFragment::Match(MatchIf::Container(container), 0),
                );
                NFABuilderFragment {
                    start_state,
                    end_states: vec![NFABuilderEndState::Match(start_state)],
                }
            }
            NFABuilder::Capture(a, group_name) => {
                let a = a.build_nfa(states, capturing_groups);
                let group_id = capturing_groups.get_or_add_group(group_name.clone());
                let group_start_state = push_state(
                    states,
                    StateFragment::CaptureStart(a.start_state, group_id.clone()),
                );
                let group_end_state = push_state(states, StateFragment::CaptureEnd(0, group_id));
                set_end_states(states, a.end_states, group_end_state);

                let end_states = vec![NFABuilderEndState::CaptureEnd(group_end_state)];
                NFABuilderFragment {
                    start_state: group_start_state,
                    end_states,
                }
            }
        }
    }
}

fn push_state(states: &mut Vec<StateFragment>, state: StateFragment) -> StateId {
    let id = states.len();
    states.push(state);
    id
}

fn set_end_states(
    states: &mut Vec<StateFragment>,
    end_states: Vec<NFABuilderEndState>,
    value: StateId,
) {
    for end_state in end_states {
        // Maybe there's a better way to write this
        match end_state {
            NFABuilderEndState::Match(state_id) => {
                let state = &mut states[state_id];
                match state {
                    StateFragment::Match(_, next_state) => {
                        *next_state = value;
                    }
                    _ => panic!("Expected a match state"),
                }
            }
            NFABuilderEndState::SplitB(state_id) => {
                let state = &mut states[state_id];
                match state {
                    StateFragment::Split(_, b) => {
                        *b = value;
                    }
                    _ => panic!("Expected a split state"),
                }
            }
            NFABuilderEndState::CaptureEnd(state_id) => {
                let state = &mut states[state_id];
                match state {
                    StateFragment::CaptureEnd(next_state, _) => {
                        *next_state = value;
                    }
                    _ => panic!("Expected a capture state"),
                }
            }
        }
    }
}

struct NFABuilderFragment {
    start_state: StateId,
    end_states: Vec<NFABuilderEndState>,
}

enum NFABuilderEndState {
    Match(StateId),
    SplitB(StateId),
    CaptureEnd(StateId),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_nfa() {
        let builder = NFABuilder::match_character(('a'..='z').into());
        let nfa = builder.build();
        assert_eq!(nfa.states.len(), 2);
        assert!(matches!(nfa.states[0], StateFragment::Match(..)));
        assert!(matches!(nfa.states[1], StateFragment::Final));
    }

    #[test]
    fn test_build_nfa_concat() {
        let builder = NFABuilder::match_character(('a'..='z').into())
            .concat(NFABuilder::match_character(('0'..='9').into()));
        let nfa = builder.build();
        assert_eq!(nfa.states.len(), 3);
        assert!(matches!(
            nfa.states[nfa.start_state],
            StateFragment::Match(..)
        ));
    }

    #[test]
    fn test_build_nfa_or() {
        let builder = NFABuilder::match_character(('a'..='z').into())
            .or(NFABuilder::match_character(('0'..='9').into()));
        let nfa = builder.build();
        assert_eq!(nfa.states.len(), 4);
        assert!(matches!(
            nfa.states[nfa.start_state],
            StateFragment::Split(..)
        ));
    }

    #[test]
    fn test_build_nfa_complex() {
        let builder = NFABuilder::match_character(('a'..='z').into())
            .one_or_more()
            .or(NFABuilder::match_character(('0'..='9').into())
                .one_or_more()
                .then_character(('0'..='9').into()));
        let nfa = builder.build();
        assert_eq!(nfa.states.len(), 7);
        assert!(matches!(
            nfa.states[nfa.start_state],
            StateFragment::Split(..)
        ));

        // Not sure how to test this
    }
}
