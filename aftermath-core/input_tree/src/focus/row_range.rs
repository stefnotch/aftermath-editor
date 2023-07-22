use std::sync::Arc;

use crate::{
    editing::editable::Editable,
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

impl Editable for MinimalInputRowRange {
    fn apply_edit(&mut self, edit: &crate::editing::BasicEdit) {
        // Edits only affect positions that are on the same row, or below.
        if !self.row_indices.starts_with(&edit.position().row_indices) {
            return;
        }
        let same_row = self.row_indices == edit.position().row_indices;
        match edit {
            crate::editing::BasicEdit::Insert {
                position: edit_position,
                values,
            } => {
                // An insert edit only moves carets on the same row
                // However, in terms of indices, it also moves indices from rows below it.
                if same_row {
                    // Avoid moving the start if it's exactly where the inserted symbols are
                    // but do move the end if it's exactly where the inserted symbols are
                    if edit_position.offset < self.start {
                        self.start = Offset(self.start.0 + values.len())
                    }
                    if edit_position.offset <= self.end {
                        self.end = Offset(self.end.0 + values.len())
                    }
                } else {
                    // If the edit is before the container, move the container
                    let row_index = self
                        .row_indices
                        .at_mut(edit_position.row_indices.len() - 1)
                        .unwrap();
                    if edit_position.offset.0 <= row_index.0 {
                        row_index.0 += values.len();
                    }
                }
            }
            crate::editing::BasicEdit::Delete {
                position: edit_position,
                values,
            } => {
                // A remove edit moves carets on the same row
                // and a remove edit clamps contained carets in children to the start of the edit
                if same_row {
                    if edit_position.offset <= self.start {
                        self.start = Offset(
                            self.start
                                .0
                                .saturating_sub(values.len())
                                .max(edit_position.offset.0),
                        );
                    }
                    if edit_position.offset <= self.end {
                        self.end = Offset(
                            self.end
                                .0
                                .saturating_sub(values.len())
                                .max(edit_position.offset.0),
                        );
                    }
                } else {
                    // if the start index is in a child, and is contained in the edit, then the end index must be contained too
                    let in_range = RowIndices::cmp_indices_and_offset(
                        &edit.position().row_indices,
                        &edit.position().offset,
                        &self.row_indices,
                        &self.start,
                    )
                    .is_le()
                        && RowIndices::cmp_indices_and_offset(
                            &self.row_indices,
                            &self.start,
                            &edit.position().row_indices,
                            &Offset(edit.position().offset.0 + values.len()),
                        )
                        .is_le();
                    if in_range {
                        self.start = edit.position().offset;
                        self.end = edit.position().offset;
                        self.row_indices = edit.position().row_indices.clone();
                    } else {
                        // If the edit is before the container, move the container
                        let row_index = self
                            .row_indices
                            .at_mut(edit_position.row_indices.len() - 1)
                            .unwrap();
                        if edit_position.offset.0 + values.len() <= row_index.0 {
                            row_index.0 -= values.len();
                        }
                    }
                }
            }
        }
    }
}
