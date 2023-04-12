use serde::{Deserialize, Serialize};

use super::row::Row;

/// A container element which can contain rows
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum MathElement {
    // containers
    /// A fraction, like $\frac{1}{2}$
    Fraction([Row; 2]),
    /// Root, like a square root
    Root([Row; 2]),
    /// Behaves like the underset LaTeX command
    Under([Row; 2]),
    /// Overset
    Over([Row; 2]),
    /// Superscript
    Sup(Row),
    /// Subscript
    Sub(Row),
    /// Every table cell is its own row, since they can contain arbitrary elements.
    /// When you select a part of table, you're actually selecting every single table cell.
    /// The selection joining part makes it behave as expected.
    /// And the rendering part makes it look like you're selecting the table.
    Table { cells: Vec<Row>, row_width: usize },
    // leaf
    /// Stores a NFD-normalized grapheme cluster.
    /// Basically a single character from the perspective of the user.
    Symbol(String),
}

impl MathElement {
    pub fn rows<'a>(&'a self) -> &'a [Row] {
        match self {
            MathElement::Fraction(v)
            | MathElement::Root(v)
            | MathElement::Under(v)
            | MathElement::Over(v) => v,
            MathElement::Sup(v) | MathElement::Sub(v) => std::slice::from_ref(v),
            MathElement::Table { cells, .. } => cells,
            MathElement::Symbol(_) => &[],
        }
    }
}
