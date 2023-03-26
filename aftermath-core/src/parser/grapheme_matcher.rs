use std::ops::RangeInclusive;

/// Matches a NFD-normalized grapheme cluster
#[derive(Debug)]
pub struct GraphemeClusterMatcher {
    codepoints: Vec<CodepointMatcher>,
}

impl GraphemeClusterMatcher {
    pub fn matches(&self, value: &str) -> bool {
        self.codepoints
            .iter()
            .zip(value.chars())
            .all(|(matcher, c)| matcher.matches(c))
    }
}

#[derive(Debug)]
pub enum CodepointMatcher {
    CharacterRange(RangeInclusive<char>),
}

impl CodepointMatcher {
    pub fn matches(&self, value: char) -> bool {
        match self {
            CodepointMatcher::CharacterRange(range) => range.contains(&value),
        }
    }
}

impl From<RangeInclusive<char>> for CodepointMatcher {
    fn from(range: RangeInclusive<char>) -> Self {
        CodepointMatcher::CharacterRange(range)
    }
}

impl From<char> for CodepointMatcher {
    fn from(c: char) -> Self {
        CodepointMatcher::CharacterRange(c..=c)
    }
}

impl From<RangeInclusive<char>> for GraphemeClusterMatcher {
    fn from(range: RangeInclusive<char>) -> Self {
        Self {
            codepoints: vec![range.into()],
        }
    }
}

impl From<char> for GraphemeClusterMatcher {
    fn from(c: char) -> Self {
        Self {
            codepoints: vec![c.into()],
        }
    }
}
