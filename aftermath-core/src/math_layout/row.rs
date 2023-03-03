/// A row contains many elements
/// An element is an enum of different types of elements
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Row<T> {
    pub values: Vec<T>,
}

impl<T> Row<T> {
    pub fn new(values: Vec<T>) -> Self {
        Row { values }
    }
}

/// We have a row > element > row > element hierarchy.
/// So to get from one row to the next, we need two indices.
#[derive(Debug, Clone, PartialEq, Eq, Ord, PartialOrd)]
pub struct RowIndex(pub usize, pub usize);
