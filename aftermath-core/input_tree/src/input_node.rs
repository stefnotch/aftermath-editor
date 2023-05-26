use serde::{Deserialize, Serialize};

use crate::row::Grid;

use super::row::InputRow;

/// A container element which can contain rows
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum InputNode {
    Container {
        container_type: InputNodeContainer,
        rows: Grid<InputRow>,
        /**
         * If there's one element, then the width is 2.
         * And the offsets are [0, 1].
         * Notice how this gives you an exclusive upper bound.
         */
        /// The number of valid offsets in all children combined.
        offset_count: u64,
    },
    /// Leaf node
    /// Stores a NFD-normalized grapheme cluster.
    /// Basically a single character from the perspective of the user.
    Symbol(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum InputNodeContainer {
    /// A fraction, like $\frac{1}{2}$
    Fraction,
    /// Root, like a square root
    Root,
    /// Behaves like the underset LaTeX command
    Under,
    /// Overset
    Over,
    /// Superscript
    Sup,
    /// Subscript
    Sub,
    /// Every table cell is its own row, since they can contain arbitrary elements.
    /// When you select a part of table, you're actually selecting every single table cell.
    /// The selection joining part makes it behave as expected.
    /// And the rendering part makes it look like you're selecting the table.
    Table,
}

impl InputNode {
    pub fn rows<'a>(&'a self) -> &'a [InputRow] {
        match self {
            InputNode::Container { rows, .. } => rows.values(),
            InputNode::Symbol(_) => &[],
        }
    }

    pub fn fraction(values: [InputRow; 2]) -> Self {
        Self::container_with_type(
            InputNodeContainer::Fraction,
            // A fraction is a vertical stack of two rows
            Grid::from_one_dimensional(values.to_vec(), 1),
        )
    }

    pub fn root(values: [InputRow; 2]) -> Self {
        Self::container_with_type(
            InputNodeContainer::Root,
            // A root is mostly horizontal
            Grid::from_one_dimensional(values.to_vec(), 2),
        )
    }

    pub fn under(values: [InputRow; 2]) -> Self {
        Self::container_with_type(
            InputNodeContainer::Under,
            Grid::from_one_dimensional(values.to_vec(), 1),
        )
    }

    pub fn over(values: [InputRow; 2]) -> Self {
        Self::container_with_type(
            InputNodeContainer::Over,
            Grid::from_one_dimensional(values.to_vec(), 1),
        )
    }

    pub fn sup(value: InputRow) -> Self {
        Self::container_with_type(
            InputNodeContainer::Sup,
            Grid::from_one_dimensional(vec![value], 1),
        )
    }

    pub fn sub(value: InputRow) -> Self {
        Self::container_with_type(
            InputNodeContainer::Sub,
            Grid::from_one_dimensional(vec![value], 1),
        )
    }

    pub fn table(values: Vec<InputRow>, width: usize) -> Self {
        Self::container_with_type(
            InputNodeContainer::Table,
            Grid::from_one_dimensional(values, width),
        )
    }

    fn container_with_type(container_type: InputNodeContainer, rows: Grid<InputRow>) -> Self {
        let offset_count = rows.values().iter().map(|row| row.offset_count()).sum();
        InputNode::Container {
            container_type,
            rows,
            offset_count,
        }
    }

    pub fn offset_count(&self) -> u64 {
        match self {
            InputNode::Container { offset_count, .. } => *offset_count,
            // A single symbol by itself doesn't have any valid offsets. The offsets come from the row.
            InputNode::Symbol(_) => 0,
        }
    }
}
