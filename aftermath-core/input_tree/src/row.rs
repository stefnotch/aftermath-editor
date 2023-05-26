use serde::{Deserialize, Serialize};

use super::input_node::InputNode;

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
pub struct InputRow {
    pub values: Vec<InputNode>,
    /// The number of valid offsets in all children combined.
    offset_count: u64,
}

impl InputRow {
    pub fn new(values: Vec<InputNode>) -> Self {
        let row_offsets = values.len() as u64 + 1;
        let child_offsets = values.iter().map(|x| x.offset_count()).sum::<u64>();
        InputRow {
            values,
            offset_count: row_offsets + child_offsets,
        }
    }

    pub fn offset_count(&self) -> u64 {
        self.offset_count
    }
}

/// A proper grid of values.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Grid<T> {
    values: Vec<T>,
    width: usize,
}

impl<T> Grid<T> {
    pub fn from_one_dimensional(values: Vec<T>, width: usize) -> Self {
        assert!(width > 0);
        assert_eq!(values.len() % width, 0);
        Grid { values, width }
    }

    pub fn width(&self) -> usize {
        self.width
    }

    pub fn height(&self) -> usize {
        self.values.len() / self.width
    }

    pub fn get(&self, x: usize, y: usize) -> Option<&T> {
        if x >= self.width() || y >= self.height() {
            return None;
        }
        let index = y * self.width() + x;
        self.values.get(index)
    }

    pub fn values(&self) -> &[T] {
        &self.values
    }
}

/// Points at a given row
pub struct RowIndices(Vec<RowIndex>);

/// We have a repeating row > element > ... hierarchy.
/// So to get from one row to the next, we need two indices.
/// One to tell us how to get to the element, and another to tell us how to get to the child row.
#[derive(Debug, Clone, PartialEq, Eq, Ord, PartialOrd, Serialize, Deserialize)]
pub struct RowIndex(pub usize, pub usize);
