use crate::{
    input_focus::InputFocusRow,
    row::{Offset, RowIndices},
};

/// A position in a row, only stores the minimal amount of data
pub struct MinimalInputRowPosition {
    pub row_indices: RowIndices,
    pub offset: Offset,
}

pub struct InputRowPosition<'a> {
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
}

impl PartialEq for InputRowPosition<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.row_focus == other.row_focus && self.offset == other.offset
    }
}

impl Eq for InputRowPosition<'_> {}

impl PartialOrd for InputRowPosition<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        let shared_len = self.row_indices().len().min(other.row_indices().len());
        let self_slice = self.row_indices().get_slice(0..shared_len);
        let other_slice = other.row_indices().get_slice(0..shared_len);

        let row_ordering = self_slice.cmp(other_slice);
        if row_ordering != std::cmp::Ordering::Equal {
            return Some(row_ordering);
        }

        // The *partial* row indices are equal, compare the offsets
        // Since we have both indices and offsets, we have to compare them in a special way
        // So we multiply both by 2, and add 1 to the indices

        let self_offset_or_index = if self_slice.len() > shared_len {
            self_slice[shared_len].0 * 2 + 1
        } else {
            self.offset.0 * 2
        };
        let other_offset_or_index = if other_slice.len() > shared_len {
            other_slice[shared_len].0 * 2 + 1
        } else {
            other.offset.0 * 2
        };

        return Some(self_offset_or_index.cmp(&other_offset_or_index));
    }
}

impl Ord for InputRowPosition<'_> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.partial_cmp(other).unwrap()
    }
}
