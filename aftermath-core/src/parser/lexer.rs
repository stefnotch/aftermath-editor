use std::ops::Range;

use crate::math_layout::{element::MathElement, row::Row};

/// A lexer that can be nested
pub struct Lexer<'input> {
    parent: Option<Box<Lexer<'input>>>,
    row: &'input Row,
    /// the index of the *next* element to be consumed
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

    pub fn get_range(&self) -> Range<usize> {
        let parent_index = self.parent.as_ref().map(|v| v.index).unwrap_or(0);
        parent_index..self.index
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math_layout::{element::MathElement, row::Row};

    #[test]
    fn test_lexer() {
        let layout = Row::new(vec![
            MathElement::Symbol("a".to_string()),
            MathElement::Fraction([
                Row::new(vec![MathElement::Symbol("b".to_string())]),
                Row::new(vec![MathElement::Symbol("c".to_string())]),
            ]),
        ]);

        let mut lexer = Lexer::new(&layout);
        let mut token = lexer.begin_token();
        assert_eq!(
            token.get_slice().get(0),
            Some(&MathElement::Symbol("a".to_string()))
        );
        token.consume_n(1);
        lexer = token.end_token().unwrap();
        assert_eq!(
            lexer.get_slice().get(0),
            Some(&MathElement::Fraction([
                Row::new(vec![MathElement::Symbol("b".to_string())]),
                Row::new(vec![MathElement::Symbol("c".to_string())]),
            ]))
        );
        lexer.consume_n(1);
        assert_eq!(lexer.get_slice().get(0), None);
    }
}
