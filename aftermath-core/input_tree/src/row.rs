use std::fmt;

use serde::{Deserialize, Serialize};

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
pub struct InputRow(pub Vec<InputNode>);

impl InputRow {
    pub fn new(values: Vec<InputNode>) -> Self {
        InputRow(values)
    }

    pub fn len(&self) -> usize {
        self.0.len()
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

impl InputRow {
    pub fn apply_edit(&mut self, edit: &super::editing::BasicEdit) {
        let position = match edit {
            super::editing::BasicEdit::Insert { position, .. } => position,
            super::editing::BasicEdit::Delete { position, .. } => position,
        };
        let mut row = self;
        for index in position.row_indices.iter() {
            row = row
                .0
                .get_mut(index.0)
                .expect("Invalid row index")
                .row_mut(index.1);
        }

        let start = position.offset.0;
        match edit {
            super::editing::BasicEdit::Insert { values, .. } => {
                row.0.splice(start..start, values.iter().cloned());
            }
            super::editing::BasicEdit::Delete { values, .. } => {
                row.0
                    .splice(start..(start + values.len()), std::iter::empty());
            }
        }
    }
}

/// Points at a given row
#[derive(Debug, Clone, PartialEq, Eq, Ord, PartialOrd, Serialize, Deserialize)]
pub struct RowIndices(Vec<RowIndex>);

/// We have a repeating row > element > ... hierarchy.
/// So to get from one row to the next, we need two indices.
/// One to tell us how to get to the element, and another to tell us how to get to the child row.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Ord, PartialOrd, Serialize, Deserialize)]
pub struct RowIndex(pub usize, pub usize);

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

    pub fn get_slice(&self, range: std::ops::Range<usize>) -> &[RowIndex] {
        &self.0[range]
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn iter(&self) -> impl Iterator<Item = &RowIndex> {
        self.0.iter()
    }
}

impl Default for RowIndices {
    fn default() -> Self {
        RowIndices::new(vec![])
    }
}

/// Offsets in a row are between the indices of the elements.
/// Goes from zero to the length of the row (inclusive).
#[derive(Debug, Copy, Clone, PartialEq, Eq, Ord, PartialOrd, Serialize, Deserialize)]
pub struct Offset(pub usize);

impl fmt::Display for InputRow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "(row")?;
        for value in &self.0 {
            write!(f, " {}", value)?;
        }
        write!(f, ")")
    }
}
