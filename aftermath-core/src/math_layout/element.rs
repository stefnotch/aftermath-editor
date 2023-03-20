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
    pub fn rows(&self) -> MathElementIterator {
        MathElementIterator {
            element: self,
            index: 0,
        }
    }
}

pub struct MathElementIterator<'a> {
    element: &'a MathElement,
    index: usize,
}

impl<'a> ExactSizeIterator for MathElementIterator<'a> {}

impl<'a> Iterator for MathElementIterator<'a> {
    type Item = &'a Row;

    fn next(&mut self) -> Option<Self::Item> {
        let index = self.index;
        self.index += 1;
        match self.element {
            MathElement::Fraction(v)
            | MathElement::Root(v)
            | MathElement::Under(v)
            | MathElement::Over(v) => v.get(index),
            MathElement::Sup(v) | MathElement::Sub(v) => {
                if index == 0 {
                    Some(v)
                } else {
                    None
                }
            }
            MathElement::Table {
                cells,
                row_width: _,
            } => cells.get(index),
            MathElement::Symbol(_) => None,
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self.element {
            MathElement::Fraction(v)
            | MathElement::Root(v)
            | MathElement::Under(v)
            | MathElement::Over(v) => (v.len(), Some(v.len())),
            MathElement::Sup(v) | MathElement::Sub(v) => (1, Some(1)),
            MathElement::Table {
                cells,
                row_width: _,
            } => (cells.len(), Some(cells.len())),
            MathElement::Symbol(_) => (0, Some(0)),
        }
    }
}
