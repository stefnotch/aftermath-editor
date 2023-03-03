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

    // TODO: We might replace the error type with something better
    Error(String),
}

pub trait Element {
    fn len(&self) -> usize;
    /*fn row_at<T>(&self, index: usize) -> Option<Row<T>>
    where
        T: Into<T>;*/
}

impl Element for MathElement {
    fn len(&self) -> usize {
        match self {
            MathElement::Fraction(v)
            | MathElement::Root(v)
            | MathElement::Under(v)
            | MathElement::Over(v) => v.len(),
            MathElement::Sup(_) | MathElement::Sub(_) => 1,
            MathElement::Table {
                cells: _,
                row_width: _,
            } => 1,
            MathElement::Symbol(_v) | MathElement::Bracket(_v) => 1,
            MathElement::Error(_v) => 1,
        }
    }
}
