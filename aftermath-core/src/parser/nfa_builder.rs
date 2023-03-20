use super::{
    grapheme_matcher::GraphemeClusterMatcher,
    token_matcher::{Container, MatchIf, StateFragment, StateId, NFA},
};

/// A builder for an NFA
pub enum NFABuilder {
    GraphemeCluster(GraphemeClusterMatcher),
    Concat(Box<NFABuilder>, Box<NFABuilder>),
    Or(Box<NFABuilder>, Box<NFABuilder>),
    ZeroOrOne(Box<NFABuilder>),
    ZeroOrMore(Box<NFABuilder>),
    OneOrMore(Box<NFABuilder>),
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
        self.concat(NFABuilder::GraphemeCluster(character))
    }
}

impl NFABuilder {
    pub fn build(self) -> NFA {
        let mut states = Vec::new();
        // A recursive builder is good enough for now
        // TODO: Make this iterative https://blog.moertel.com/posts/2013-05-11-recursive-to-iterative.html
        let builder_fragment = self.build_nfa(&mut states);
        let end_state = push_state(&mut states, StateFragment::Final);
        set_end_states(&mut states, builder_fragment.end_states, end_state);

        NFA::new(states, builder_fragment.start_state)
    }

    fn build_nfa(self, states: &mut Vec<StateFragment>) -> NFABuilderFragment {
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
                let a = a.build_nfa(states);
                let b = b.build_nfa(states);

                set_end_states(states, a.end_states, b.start_state);

                NFABuilderFragment {
                    start_state: a.start_state,
                    end_states: b.end_states,
                }
            }
            NFABuilder::Or(a, b) => {
                let a = a.build_nfa(states);
                let mut b = b.build_nfa(states);

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
                let a = a.build_nfa(states);

                let start_state = push_state(states, StateFragment::Split(a.start_state, 0));

                let mut end_states = a.end_states;
                end_states.push(NFABuilderEndState::SplitB(start_state));
                NFABuilderFragment {
                    start_state,
                    end_states,
                }
            }
            NFABuilder::ZeroOrMore(a) => {
                let a = a.build_nfa(states);

                let start_state = push_state(states, StateFragment::Split(a.start_state, 0));
                set_end_states(states, a.end_states, start_state);

                let end_states = vec![NFABuilderEndState::SplitB(start_state)];
                NFABuilderFragment {
                    start_state,
                    end_states,
                }
            }
            NFABuilder::OneOrMore(a) => {
                let a = a.build_nfa(states);

                let loop_state = push_state(states, StateFragment::Split(a.start_state, 0));
                set_end_states(states, a.end_states, loop_state);

                let end_states = vec![NFABuilderEndState::SplitA(loop_state)];
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
            NFABuilderEndState::SplitA(state_id) => {
                let state = &mut states[state_id];
                match state {
                    StateFragment::Split(a, _) => {
                        *a = value;
                    }
                    _ => panic!("Expected a split state"),
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
        }
    }
}

struct NFABuilderFragment {
    start_state: StateId,
    end_states: Vec<NFABuilderEndState>,
}

enum NFABuilderEndState {
    Match(StateId),
    SplitA(StateId),
    SplitB(StateId),
}

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
        assert!(matches!(nfa.states[0], StateFragment::Match(..)));
        assert!(matches!(nfa.states[1], StateFragment::Match(..)));
        assert!(matches!(nfa.states[2], StateFragment::Final));
    }
}
