use super::row::Row;
use std::backtrace::Backtrace;

#[derive(Debug, PartialEq, Eq)]
pub enum MathElement {
    // containers
    Fraction([Row; 2]),
    Root([Row; 2]),
    Under([Row; 2]),
    Over([Row; 2]),
    Sup(Row),
    Sub(Row),
    Table { cells: Vec<Row>, row_width: usize },
    // leaf
    Symbol(String),
    Bracket(String),
}

impl Clone for MathElement {
    fn clone(&self) -> Self {
        let bt = Backtrace::capture();
        println!("clone called at {}", bt);
        match self {
            Self::Fraction(arg0) => Self::Fraction(arg0.clone()),
            Self::Root(arg0) => Self::Root(arg0.clone()),
            Self::Under(arg0) => Self::Under(arg0.clone()),
            Self::Over(arg0) => Self::Over(arg0.clone()),
            Self::Sup(arg0) => Self::Sup(arg0.clone()),
            Self::Sub(arg0) => Self::Sub(arg0.clone()),
            Self::Table { cells, row_width } => Self::Table {
                cells: cells.clone(),
                row_width: row_width.clone(),
            },
            Self::Symbol(arg0) => Self::Symbol(arg0.clone()),
            Self::Bracket(arg0) => Self::Bracket(arg0.clone()),
        }
    }
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
            MathElement::Symbol(_) | MathElement::Bracket(_) => None,
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
            MathElement::Symbol(_) | MathElement::Bracket(_) => (0, Some(0)),
        }
    }
}
