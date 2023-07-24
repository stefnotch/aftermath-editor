use std::fmt;

use serde::{Deserialize, Serialize};

use crate::{grid::Grid, print_helpers::write_with_escaped_double_quotes};

use super::row::InputRow;

/// A container element which can contain rows
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum InputNode {
    /// A container with a type
    Container(InputNodeVariant, Grid<InputRow>),
    /// Leaf node
    /// Stores a NFD-normalized grapheme cluster.
    /// Basically a single character from the perspective of the user.
    Symbol(String),
}

// Could be extended with constructs like <mmultiscripts>
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum InputNodeVariant {
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
            InputNode::Container(_, rows) => rows.values(),
            InputNode::Symbol(_) => &[],
        }
    }

    pub fn fraction(values: [InputRow; 2]) -> Self {
        Self::container_with_type(
            InputNodeVariant::Fraction,
            // A fraction is a vertical stack of two rows
            Grid::from_one_dimensional(values.to_vec(), 1),
        )
    }

    pub fn root(values: [InputRow; 2]) -> Self {
        Self::container_with_type(
            InputNodeVariant::Root,
            // A root is mostly horizontal
            Grid::from_one_dimensional(values.to_vec(), 2),
        )
    }

    pub fn under(values: [InputRow; 2]) -> Self {
        Self::container_with_type(
            InputNodeVariant::Under,
            Grid::from_one_dimensional(values.to_vec(), 1),
        )
    }

    pub fn over(values: [InputRow; 2]) -> Self {
        Self::container_with_type(
            InputNodeVariant::Over,
            Grid::from_one_dimensional(values.to_vec(), 1),
        )
    }

    pub fn sup(value: InputRow) -> Self {
        Self::container_with_type(
            InputNodeVariant::Sup,
            Grid::from_one_dimensional(vec![value], 1),
        )
    }

    pub fn sub(value: InputRow) -> Self {
        Self::container_with_type(
            InputNodeVariant::Sub,
            Grid::from_one_dimensional(vec![value.into()], 1),
        )
    }

    pub fn table(values: Vec<InputRow>, width: usize) -> Self {
        Self::container_with_type(
            InputNodeVariant::Table,
            Grid::from_one_dimensional(values, width),
        )
    }
    pub fn symbol<T: Into<String>>(value: T) -> Self {
        Self::Symbol(value.into())
    }

    pub fn symbols<T: Into<String>>(values: Vec<T>) -> Vec<Self> {
        values
            .into_iter()
            .map(|value| Self::Symbol(value.into()))
            .collect()
    }

    fn container_with_type(container_type: InputNodeVariant, rows: Grid<InputRow>) -> Self {
        InputNode::Container(container_type, rows)
    }

    pub fn row_mut(&mut self, index: usize) -> &mut InputRow {
        match self {
            InputNode::Container(_, rows) => rows
                .get_mut(rows.index_to_xy(index))
                .expect("Invalid row index"),
            InputNode::Symbol(_) => panic!("Can't get row of symbol"),
        }
    }

    pub fn has_resizable_grid(&self) -> bool {
        match self {
            InputNode::Container(variant, _) => variant.has_resizable_grid(),
            InputNode::Symbol(_) => false,
        }
    }

    pub fn grid(&self) -> Option<&Grid<InputRow>> {
        match self {
            InputNode::Container(_, grid) => Some(grid),
            InputNode::Symbol(_) => None,
        }
    }

    pub fn grid_mut(&mut self) -> Option<&mut Grid<InputRow>> {
        match self {
            InputNode::Container(_, grid) => Some(grid),
            InputNode::Symbol(_) => None,
        }
    }
}

impl fmt::Display for InputNode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InputNode::Container(container_type, rows) => {
                write!(f, "({} {})", container_type, rows)?;
            }
            InputNode::Symbol(value) => {
                write!(f, "\"")?;
                write_with_escaped_double_quotes(value, f)?;
                write!(f, "\"")?;
            }
        }
        Ok(())
    }
}

impl InputNodeVariant {
    pub fn has_resizable_grid(&self) -> bool {
        match self {
            InputNodeVariant::Fraction => false,
            InputNodeVariant::Root => false,
            InputNodeVariant::Under => false,
            InputNodeVariant::Over => false,
            InputNodeVariant::Sup => false,
            InputNodeVariant::Sub => false,
            InputNodeVariant::Table => true,
        }
    }
}

impl fmt::Display for InputNodeVariant {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InputNodeVariant::Fraction => write!(f, "frac"),
            InputNodeVariant::Root => write!(f, "root"),
            InputNodeVariant::Under => write!(f, "under"),
            InputNodeVariant::Over => write!(f, "over"),
            InputNodeVariant::Sup => write!(f, "sup"),
            InputNodeVariant::Sub => write!(f, "sub"),
            InputNodeVariant::Table => write!(f, "table"),
        }
    }
}
