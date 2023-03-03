use super::row::Row;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MathElement {
    // containers
    Fraction([Row<MathElement>; 2]),
    Root([Row<MathElement>; 2]),
    Under([Row<MathElement>; 2]),
    Over([Row<MathElement>; 2]),
    Sup(Row<MathElement>),
    Sub(Row<MathElement>),
    // wrapper
    Text(Row<TextElement>),
    Table {
        cells: Row<TableElement>,
        row_width: usize,
    },
    // leaf
    Symbol(String),
    Bracket(String),

    // TODO: We might replace the error type with something better
    Error(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TextElement {
    Character(String),
    Math(Row<MathElement>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TableElement {
    TableCell(Row<MathElement>),
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
            MathElement::Text(_) => 1,
            MathElement::Table { cells, row_width } => 1,
            MathElement::Symbol(v) | MathElement::Bracket(v) => 1,
            MathElement::Error(v) => 1,
        }
    }
}
impl Element for TextElement {
    fn len(&self) -> usize {
        match self {
            TextElement::Character(v) => 1,
            TextElement::Math(v) => 1,
        }
    }
}
impl Element for TableElement {
    fn len(&self) -> usize {
        match self {
            TableElement::TableCell(v) => 1,
        }
    }
}
/*
impl TextElement {
    fn row_at<T: Element>(&self, index: usize) -> Option<Row<T>>
    where
        Row<T>: From<Row<MathElement>> + From<Row<TextElement>>,
    {
        match self {
            TextElement::Character(v) => {
                Some(Row::<TextElement>::new(vec![TextElement::Character("a".to_string())]).into())
            }
            TextElement::Math(v) => Some((*v).into()),
        }
    }

    fn dum<T: Element>() -> Option<Row<T>> {
        let a = TextElement::Character("a".to_string());
        a.row_at(0)
    }
}
*/
