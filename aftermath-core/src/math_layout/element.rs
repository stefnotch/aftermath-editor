use super::row::Row;

#[derive(Debug, Clone, PartialEq, Eq)]
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

pub trait Element {
    fn child_row_count(&self) -> usize;
    /*fn row_at<T>(&self, index: usize) -> Option<Row<T>>
    where
        T: Into<T>;*/
}

impl Element for MathElement {
    fn child_row_count(&self) -> usize {
        match self {
            MathElement::Fraction(v)
            | MathElement::Root(v)
            | MathElement::Under(v)
            | MathElement::Over(v) => v.len(),
            MathElement::Sup(_) | MathElement::Sub(_) => 1,
            MathElement::Table {
                cells,
                row_width: _,
            } => cells.len(),
            MathElement::Symbol(_v) | MathElement::Bracket(_v) => 0,
        }
    }
}
