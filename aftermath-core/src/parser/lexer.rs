use crate::math_layout::{element::MathElement, row::Row};

/// A lexer that can be nested
pub struct Lexer<'input> {
    parent: Option<Box<Lexer<'input>>>,
    row: &'input Row,
    index: usize,
}

impl<'input> Lexer<'input> {
    pub fn new(row: &Row) -> Lexer {
        Lexer {
            parent: None,
            row,
            index: 0,
        }
    }

    pub fn begin_token(self) -> Lexer<'input> {
        let index = self.index;
        let row = self.row;
        Lexer {
            parent: Some(Box::new(self)),
            row,
            index,
        }
    }

    pub fn consume_n(&mut self, count: usize) {
        self.index += count;
        assert!(self.index <= self.row.values.len());
    }

    // TODO: https://doc.rust-lang.org/reference/attributes/diagnostics.html#the-must_use-attribute ?
    pub fn end_token(self) -> Option<Lexer<'input>> {
        assert!(self.index <= self.row.values.len());
        if let Some(mut parent) = self.parent {
            parent.index = self.index;
            Some(*parent)
        } else {
            None
        }
    }

    pub fn discard_token(mut self) -> Option<Lexer<'input>> {
        self.parent.take().map(|v| *v)
    }

    pub fn get_slice(&self) -> &'input [MathElement] {
        &self.row.values[self.index..]
    }

    pub fn eof(&self) -> bool {
        self.index >= self.row.values.len()
    }

    pub fn get_index(&self) -> usize {
        self.index
    }
}
