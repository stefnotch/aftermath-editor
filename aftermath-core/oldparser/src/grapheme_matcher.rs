use std::ops::RangeInclusive;

use unicode_ident::{is_xid_continue, is_xid_start};

/// Matches a NFD-normalized grapheme cluster
#[derive(Debug)]
pub enum GraphemeMatcher {
    Codepoint(RangeInclusive<char>),
    IdentifierStart,
    IdentifierContinue,
}

impl GraphemeMatcher {
    pub fn matches(&self, value: &str) -> bool {
        match self {
            GraphemeMatcher::Codepoint(range) => {
                let mut chars = value.chars();
                let matches = chars.next().map(|c| range.contains(&c)).unwrap_or(false);
                matches && chars.next().is_none()
            }
            GraphemeMatcher::IdentifierStart => {
                let mut chars = value.chars();
                let matches = chars.next().map(|c| is_xid_start(c)).unwrap_or(false);
                matches && chars.all(|c| is_xid_continue(c))
            }
            GraphemeMatcher::IdentifierContinue => value.chars().all(|c| is_xid_continue(c)),
        }
    }
}

impl From<RangeInclusive<char>> for GraphemeMatcher {
    fn from(range: RangeInclusive<char>) -> Self {
        Self::Codepoint(range)
    }
}

impl From<char> for GraphemeMatcher {
    fn from(c: char) -> Self {
        Self::Codepoint(c..=c)
    }
}
