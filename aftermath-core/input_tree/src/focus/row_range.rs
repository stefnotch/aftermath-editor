use std::sync::Arc;

use crate::{
    focus::InputFocusRow,
    focus::InputRowPosition,
    row::{Offset, RowIndices},
};

/// A range in a row, only stores the minimal amount of data
pub struct MinimalInputRowRange {
    pub row_indices: RowIndices,
    pub start: Offset,
    pub end: Offset,
}

/// An inclusive range of positions in a row
pub struct InputRowRange<'a> {
    pub row_focus: Arc<InputFocusRow<'a>>,
    pub start: Offset,
    pub end: Offset,
}

impl<'a> InputRowRange<'a> {
    pub fn new(row_focus: InputFocusRow<'a>, start: Offset, end: Offset) -> Self {
        assert!(start.0 <= row_focus.len());
        assert!(end.0 <= row_focus.len());
        Self {
            row_focus: Arc::new(row_focus),
            start,
            end,
        }
    }

    pub fn left_offset(&self) -> Offset {
        if self.is_forwards() {
            self.start
        } else {
            self.end
        }
    }

    pub fn right_offset(&self) -> Offset {
        if self.is_forwards() {
            self.end
        } else {
            self.start
        }
    }

    pub fn is_collapsed(&self) -> bool {
        self.start == self.end
    }

    pub fn is_forwards(&self) -> bool {
        self.start <= self.end
    }

    pub fn start_position(&self) -> InputRowPosition<'a> {
        InputRowPosition {
            row_focus: self.row_focus.clone(),
            offset: self.start,
        }
    }

    pub fn end_position(&self) -> InputRowPosition<'a> {
        InputRowPosition {
            row_focus: self.row_focus.clone(),
            offset: self.end,
        }
    }

    pub fn left_position(&self) -> InputRowPosition<'a> {
        let offset = self.left_offset();
        InputRowPosition {
            row_focus: self.row_focus.clone(),
            offset,
        }
    }

    pub fn right_position(&self) -> InputRowPosition<'a> {
        let offset = self.right_offset();
        InputRowPosition {
            row_focus: self.row_focus.clone(),
            offset,
        }
    }

    pub fn row_indices(&self) -> &RowIndices {
        &self.row_focus.row_indices()
    }

    pub fn contains(&self, position: &InputRowPosition<'a>) -> bool {
        &self.left_position() <= position && position <= &self.right_position()
    }

    pub fn to_minimal(&self) -> MinimalInputRowRange {
        MinimalInputRowRange {
            row_indices: self.row_focus.row_indices().clone(),
            start: self.start,
            end: self.end,
        }
    }

    pub fn from_minimal(root: InputFocusRow<'a>, minimal: &MinimalInputRowRange) -> Self {
        Self::new(
            root.walk_down_indices(&minimal.row_indices),
            minimal.start,
            minimal.end,
        )
    }
}

impl PartialEq for InputRowRange<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.row_focus == other.row_focus && self.start == other.start && self.end == other.end
    }
}

impl Eq for InputRowRange<'_> {}
