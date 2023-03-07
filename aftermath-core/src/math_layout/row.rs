use serde::{Deserialize, Serialize};

use super::element::MathElement;

/// A row contains many elements
/// An element is an enum of different types of elements
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
