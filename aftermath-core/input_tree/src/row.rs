use std::fmt;

use serde::{Deserialize, Serialize};

use crate::print_helpers::write_with_separator;

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

/// A proper grid of values.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Grid<T> {
    values: Vec<T>,
    width: usize,
}

/// A 2D index
pub struct Index2D {
    pub x: usize,
    pub y: usize,
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

    pub fn get(&self, xy: Index2D) -> Option<&T> {
        let Index2D { x, y } = xy;
        if x >= self.width() || y >= self.height() {
            return None;
        }
        self.values.get(self.xy_to_index(xy))
    }

    pub fn get_by_index(&self, index: usize) -> Option<&T> {
        self.values.get(index)
    }

    pub fn index_to_xy(&self, index: usize) -> Index2D {
        Index2D {
            x: index % self.width,
            y: index / self.width,
        }
    }

    pub fn xy_to_index(&self, xy: Index2D) -> usize {
        let Index2D { x, y } = xy;
        y * self.width + x
    }

    pub fn values(&self) -> &[T] {
        &self.values
    }

    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
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
#[derive(Debug, Copy, Clone, PartialEq, Eq, Ord, PartialOrd, Serialize, Deserialize)]
pub struct Offset(pub usize);

impl<T: std::fmt::Display> fmt::Display for Grid<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}x{}", self.width(), self.height())?;
        write_with_separator(self.values(), " ", f)
    }
}

impl fmt::Display for InputRow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        write_with_separator(&self.0, " ", f)
    }
}
