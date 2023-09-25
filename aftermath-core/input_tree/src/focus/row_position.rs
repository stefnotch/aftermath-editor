use serde::{Deserialize, Serialize};

use crate::{
    editing::editable::Editable,
    focus::InputFocusRow,
    focus::InputRowRange,
    row::{Offset, RowIndices},
};

use super::MinimalInputRowRange;

/// A offset in a row, only stores the minimal amount of data
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct MinimalInputRowPosition {
    pub row_indices: RowIndices,
    pub offset: Offset,
}

#[derive(Clone, PartialEq, Eq)]
pub struct InputRowPosition<'a> {
    // Maybe use something like https://stackoverflow.com/questions/65031642/in-rust-whats-the-pattern-for-when-you-need-a-reference-holding-struct-to-some
    // in the future
    pub row_focus: InputFocusRow<'a>,
    pub offset: Offset,
}

impl<'a> InputRowPosition<'a> {
    pub fn new(row_focus: InputFocusRow<'a>, offset: Offset) -> Self {
        assert!(offset.0 <= row_focus.len());
        Self { row_focus, offset }
    }

    pub fn row_indices(&self) -> &RowIndices {
        &self.row_focus.row_indices()
    }

    pub fn to_minimal(&self) -> MinimalInputRowPosition {
        MinimalInputRowPosition {
            row_indices: self.row_focus.row_indices().clone(),
            offset: self.offset,
        }
    }

    pub fn from_minimal(root: InputFocusRow<'a>, minimal: &MinimalInputRowPosition) -> Self {
        Self::new(root.walk_down_indices(&minimal.row_indices), minimal.offset)
    }

    pub fn in_range(&self, range: InputRowRange<'a>) -> bool {
        range.contains(self)
    }
}

impl<'a> Into<InputRowRange<'a>> for &InputRowPosition<'a> {
    fn into(self) -> InputRowRange<'a> {
        InputRowRange {
            row_focus: self.row_focus.clone(),
            start: self.offset,
            end: self.offset,
        }
    }
}

impl PartialOrd for InputRowPosition<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for InputRowPosition<'_> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        RowIndices::cmp_indices_and_offset(
            self.row_indices(),
            &self.offset,
            other.row_indices(),
            &other.offset,
        )
    }
}

impl Editable for MinimalInputRowPosition {
    fn apply_edit(&mut self, edit: &crate::editing::BasicEdit) {
        let mut range = MinimalInputRowRange {
            row_indices: self.row_indices.clone(),
            start: self.offset,
            end: self.offset,
        };
        range.apply_edit(edit);
        self.row_indices = range.row_indices;
        self.offset = range.start;
    }
}
