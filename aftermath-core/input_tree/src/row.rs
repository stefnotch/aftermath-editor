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
}

impl InputRow {
    pub fn new(values: Vec<InputNode>) -> Self {
        InputRow { values }
    }
}

// TODO: Refactor to use this
pub struct InputRows {
  pub values: Grid<Vec<InputNode>>,
}

/// A proper grid of values.
pub struct Grid<T> {
    values: Vec<Vec<T>>,
}

impl<T> Grid<T> {
    pub fn new(values: Vec<Vec<T>>) -> Self {
        if let Some(first) = values.first() {
            let width = first.len();
            for row in values.iter() {
                assert_eq!(row.len(), width);
            }
        }
        Grid { values }
    }

    pub fn width(&self) -> usize {
        self.values.first().map(|row| row.len()).unwrap_or(0)
    }

    pub fn height(&self) -> usize {
        self.values.len()
    }
}

/// Points at a given row
pub struct RowIndices(Vec<RowIndex>);

/// We have a repeating row > element > ... hierarchy.
/// So to get from one row to the next, we need two indices.
/// One to tell us how to get to the element, and another to tell us how to get to the child row.
#[derive(Debug, Clone, PartialEq, Eq, Ord, PartialOrd, Serialize, Deserialize)]
pub struct RowIndex(pub usize, pub usize);
