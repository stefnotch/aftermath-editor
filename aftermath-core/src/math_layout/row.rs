use serde::{Deserialize, Serialize};

use super::element::MathElement;

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
pub struct Row {
    pub values: Vec<MathElement>,
}

impl Row {
    pub fn new(values: Vec<MathElement>) -> Self {
        Row { values }
    }
}

/// Points at a given row
pub struct RowIndices(Vec<RowIndex>);

/// We have a repeating row > element > ... hierarchy.
/// So to get from one row to the next, we need two indices.
#[derive(Debug, Clone, PartialEq, Eq, Ord, PartialOrd)]
pub struct RowIndex(pub usize, pub usize);
