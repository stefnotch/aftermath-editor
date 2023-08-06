use serde::{Deserialize, Serialize};

use crate::{
    editing::editable::Editable,
    focus::InputFocusRow,
    focus::InputRowPosition,
    row::{Offset, RowIndices},
};

/// A range in a row, only stores the minimal amount of data
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct MinimalInputRowRange {
    pub row_indices: RowIndices,
    pub start: Offset,
    pub end: Offset,
}

/// An range of positions in a row
#[derive(Clone, PartialEq, Eq)]
pub struct InputRowRange<'a> {
    pub row_focus: InputFocusRow<'a>,
    pub start: Offset,
    pub end: Offset,
}

impl<'a> InputRowRange<'a> {
    pub fn new(row_focus: InputFocusRow<'a>, start: Offset, end: Offset) -> Self {
        assert!(start.0 <= row_focus.len());
        assert!(end.0 <= row_focus.len());
        Self {
            row_focus,
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

    pub fn values(&self) -> impl Iterator<Item = &crate::node::InputNode> {
        self.row_focus
            .row()
            .0
            .iter()
            .skip(self.start.0)
            .take(self.end.0 - self.start.0)
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

impl Editable for MinimalInputRowRange {
    fn apply_edit(&mut self, edit: &crate::editing::BasicEdit) {
        use crate::editing::row_indices_edit::RowIndicesEdit;

        let edit = edit.get_row_indices_edit();
        let row_indices = match edit {
            RowIndicesEdit::RowIndexEdit { row_indices, .. } => row_indices,
            RowIndicesEdit::GridIndexEdit {
                element_indices, ..
            } => &element_indices.row_indices,
        };
        // Edits only affect positions that are on the same row, or below.
        if !self.row_indices.starts_with(row_indices) {
            return;
        }

        // Keep start and end in a sensible order for the code below
        let is_forwards = self.start <= self.end;
        if !is_forwards {
            std::mem::swap(&mut self.start, &mut self.end);
        }

        match edit {
            RowIndicesEdit::RowIndexEdit {
                row_indices,
                old_offset,
                new_offset,
            } => {
                let same_row = &self.row_indices == row_indices;
                if edit.is_insert() && same_row {
                    // Same row insertion
                    // Special rule: Avoid moving the start if it's exactly where the inserted symbols are
                    let delta = new_offset.0 - old_offset.0;
                    if old_offset < self.start {
                        self.start = Offset(self.start.0 + delta)
                    }
                    if old_offset <= self.end {
                        self.end = Offset(self.end.0 + delta)
                    }
                } else if !edit.is_insert() && same_row {
                    // Same row deletion
                    let delta = old_offset.0 - new_offset.0;
                    if new_offset < self.start {
                        self.start = Offset(self.start.0.saturating_sub(delta).max(new_offset.0));
                    }
                    if new_offset <= self.end {
                        self.end = Offset(self.end.0.saturating_sub(delta).max(new_offset.0));
                    }
                } else if edit.is_insert() {
                    // Child row insertion, if the edit is before the container, move the container
                    let row_index = self.row_indices.at_mut(row_indices.len() - 1).unwrap();
                    if old_offset.0 <= row_index.0 {
                        let delta = new_offset.0 - old_offset.0;
                        row_index.0 += delta;
                    }
                } else {
                    // Child row deletion
                    let row_index = self.row_indices.at_mut(row_indices.len() - 1).unwrap();
                    if new_offset.0 <= row_index.0 && row_index.0 < old_offset.0 {
                        // I'm inside the deleted range, move to the start of the edit
                        self.start = new_offset;
                        self.end = new_offset;
                        self.row_indices = row_indices.clone();
                    } else if old_offset.0 <= row_index.0 {
                        // I'm after the deleted range, move the container
                        let delta = old_offset.0 - new_offset.0;
                        row_index.0 -= delta;
                    }
                }
            }
            RowIndicesEdit::GridIndexEdit { .. } => todo!(), // TODO: Implement
        }

        if !is_forwards {
            std::mem::swap(&mut self.start, &mut self.end);
        }
    }
}
