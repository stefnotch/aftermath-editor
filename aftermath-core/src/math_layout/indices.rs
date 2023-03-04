use super::{element::MathElement, row::Row};

/// Points at a given row
pub struct AncestorIndices(Vec<AncestorIndex>);

/// Go from a row to a container and then to a child row
/// Order is "-> container -> row"
pub struct AncestorIndex {
    index_of_container: usize,
    index_of_row: usize,
}
