use std::sync::Arc;

use crate::{
    focus::InputFocusRow,
    focus::InputRowRange,
    row::{Offset, RowIndices},
};

/// A offset in a row, only stores the minimal amount of data
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MinimalInputRowPosition {
    pub row_indices: RowIndices,
    pub offset: Offset,
}

pub struct InputRowPosition<'a> {
    pub row_focus: Arc<InputFocusRow<'a>>,
    pub offset: Offset,
}

impl<'a> InputRowPosition<'a> {
    pub fn new(row_focus: InputFocusRow<'a>, offset: Offset) -> Self {
        assert!(offset.0 <= row_focus.len());
        Self {
            row_focus: Arc::new(row_focus),
            offset,
        }
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

impl PartialEq for InputRowPosition<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.row_focus == other.row_focus && self.offset == other.offset
    }
}

impl Eq for InputRowPosition<'_> {}

impl PartialOrd for InputRowPosition<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(RowIndices::cmp_indices_and_offset(
            self.row_indices(),
            &self.offset,
            other.row_indices(),
            &other.offset,
        ))
    }
}

impl Ord for InputRowPosition<'_> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.partial_cmp(other).unwrap()
    }
}
