use std::fmt;

use serde::{Deserialize, Serialize};

use crate::direction::HorizontalDirection;

use super::node::InputNode;

/// A simple representation of what a math formula looks like.
/// Optimized for editing, purposefully does not assign meaning to most characters.
/// For instance, if the formula contains "0xe", we just say it has the characters 0, x, e. And the user can move the caret between those elements.
/// We store the characters (graphemes) individually, because moving the caret and deleting characters is easier to implement that way.
/// Parsing is done later.
/// A row contains an arbitrary number of elements.
/// An element is an enum of different types of elements.
/// Invariants:
/// - The parent-child order is always Row -> Element -> Row -> Element -> ....
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct InputRow {
    pub values: Vec<InputNode>,
}

impl InputRow {
    pub fn new(values: Vec<InputNode>) -> Self {
        InputRow { values }
    }

    pub fn len(&self) -> usize {
        self.values.len()
    }

    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    pub fn offset_to_index(&self, offset: Offset, direction: HorizontalDirection) -> Option<usize> {
        match direction {
            HorizontalDirection::Left => {
                if offset.0 == 0 {
                    None
                } else {
                    Some(offset.0 - 1)
                }
            }
            HorizontalDirection::Right => {
                if offset.0 >= self.len() {
                    None
                } else {
                    Some(offset.0)
                }
            }
        }
    }
}

impl Default for InputRow {
    fn default() -> Self {
        InputRow::new(vec![])
    }
}

impl From<Vec<InputNode>> for InputRow {
    fn from(values: Vec<InputNode>) -> Self {
        InputRow::new(values)
    }
}

/// Points at a given row
#[derive(Debug, Clone, PartialEq, Eq, Ord, PartialOrd, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct RowIndices(Vec<RowIndex>);

/// We have a repeating row > element > ... hierarchy.
/// So to get from one row to the next, we need two indices.
/// One to tell us how to get to the element, and another to tell us how to get to the child row.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Ord, PartialOrd, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct RowIndex(pub usize, pub usize);

impl From<(usize, usize)> for RowIndex {
    fn from(value: (usize, usize)) -> Self {
        RowIndex(value.0, value.1)
    }
}

/// Points at a given element.
#[derive(Debug, Clone, PartialEq, Eq, Ord, PartialOrd, Serialize, Deserialize)]
pub struct ElementIndices {
    pub row_indices: RowIndices,
    pub index: usize,
}

impl RowIndices {
    pub fn new(values: Vec<RowIndex>) -> Self {
        RowIndices(values)
    }

    pub fn push(&mut self, value: RowIndex) {
        self.0.push(value);
    }

    pub fn pop(&mut self) -> Option<RowIndex> {
        self.0.pop()
    }

    pub fn starts_with(&self, other: &Self) -> bool {
        self.0.starts_with(&other.0)
    }

    pub fn get_shared(&self, other: &Self) -> RowIndices {
        RowIndices::new(
            self.0
                .iter()
                .zip(other.0.iter())
                .take_while(|(a, b)| a == b)
                .map(|(a, _)| *a)
                .collect(),
        )
    }

    pub fn at(&self, index: usize) -> Option<RowIndex> {
        self.0.get(index).copied()
    }

    pub fn at_mut(&mut self, index: usize) -> Option<&mut RowIndex> {
        self.0.get_mut(index)
    }

    fn get_slice(&self, range: std::ops::Range<usize>) -> &[RowIndex] {
        &self.0[range]
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &RowIndex> {
        self.0.iter()
    }
}

impl RowIndices {
    pub fn cmp_indices_and_offset(
        self_indices: &RowIndices,
        self_offset: &Offset,
        other_indices: &RowIndices,
        other_offset: &Offset,
    ) -> std::cmp::Ordering {
        let shared_len = self_indices.len().min(other_indices.len());
        {
            let self_slice = self_indices.get_slice(0..shared_len);
            let other_slice = other_indices.get_slice(0..shared_len);
            let row_ordering = self_slice.cmp(other_slice);
            if row_ordering != std::cmp::Ordering::Equal {
                return row_ordering;
            }
        }

        // The *partial* row indices are equal, compare the offsets
        // Since we have both indices and offsets, we have to compare them in a special way
        // So we multiply both by 2, and add 1 to the indices

        let self_offset_or_index = if self_indices.len() > shared_len {
            self_indices.at(shared_len).unwrap().0 * 2 + 1
        } else {
            self_offset.0 * 2
        };
        let other_offset_or_index = if other_indices.len() > shared_len {
            other_indices.at(shared_len).unwrap().0 * 2 + 1
        } else {
            other_offset.0 * 2
        };

        self_offset_or_index.cmp(&other_offset_or_index)
    }
}

impl Default for RowIndices {
    fn default() -> Self {
        RowIndices::new(vec![])
    }
}

/// Offsets in a row are between the indices of the elements.
/// Goes from zero to the length of the row (inclusive).
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Ord, PartialOrd, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct Offset(pub usize);

impl From<usize> for Offset {
    fn from(value: usize) -> Self {
        Offset(value)
    }
}

impl fmt::Display for InputRow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "(row")?;
        for value in &self.values {
            write!(f, " {}", value)?;
        }
        write!(f, ")")
    }
}
