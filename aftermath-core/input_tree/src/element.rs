use serde::{Deserialize, Serialize};

use super::row::InputRow;

/// A container element which can contain rows
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum InputElement {
    // containers
    /// A fraction, like $\frac{1}{2}$
    Fraction([InputRow; 2]),
    /// Root, like a square root
    Root([InputRow; 2]),
    /// Behaves like the underset LaTeX command
    Under([InputRow; 2]),
    /// Overset
    Over([InputRow; 2]),
    /// Superscript
    Sup(InputRow),
    /// Subscript
    Sub(InputRow),
    /// Every table cell is its own row, since they can contain arbitrary elements.
    /// When you select a part of table, you're actually selecting every single table cell.
    /// The selection joining part makes it behave as expected.
    /// And the rendering part makes it look like you're selecting the table.
    Table {
        cells: Vec<InputRow>,
        row_width: usize,
    },
    // leaf
    /// Stores a NFD-normalized grapheme cluster.
    /// Basically a single character from the perspective of the user.
    Symbol(String),
}

impl InputElement {
    pub fn rows<'a>(&'a self) -> &'a [InputRow] {
        match self {
            InputElement::Fraction(v)
            | InputElement::Root(v)
            | InputElement::Under(v)
            | InputElement::Over(v) => v,
            InputElement::Sup(v) | InputElement::Sub(v) => std::slice::from_ref(v),
            InputElement::Table { cells, .. } => cells,
            InputElement::Symbol(_) => &[],
        }
    }
}
