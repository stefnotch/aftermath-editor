use std::ops::Range;

use input_tree::input_node::InputNode;

// TODO: I bet there's a better design for this
/// A lexer that can be nested
pub struct Lexer<'input> {
    parent: Option<Box<Lexer<'input>>>,
    values: &'input [InputNode],
    /// the index of the *next* element to be consumed
    index: usize,
}

impl<'input> Lexer<'input> {
    pub fn new(row: &[InputNode]) -> Lexer {
        Lexer {
            parent: None,
            values: row,
            index: 0,
        }
    }

    pub fn begin_token(self) -> Lexer<'input> {
        let index = self.index;
        let row = self.values;
        Lexer {
            parent: Some(Box::new(self)),
            values: row,
            index,
        }
    }

    pub fn consume_n(&mut self, count: usize) {
        self.index += count;
        assert!(self.index <= self.values.len());
    }

    pub fn get_range(&self) -> Range<usize> {
        let parent_index = self.parent.as_ref().map(|v| v.index).unwrap_or(0);
        parent_index..self.index
    }

    // TODO: https://doc.rust-lang.org/reference/attributes/diagnostics.html#the-must_use-attribute ?
    pub fn end_token(self) -> Option<Lexer<'input>> {
        assert!(self.index <= self.values.len());
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

    /// Gets a slice with all the *next* elements
    pub fn get_slice(&self) -> &'input [InputNode] {
        &self.values[self.index..]
    }

    pub fn eof(&self) -> bool {
        self.index >= self.values.len()
    }

    pub fn get_symbols(&self) -> Vec<String> {
        let range = self.get_range();
        let mut result = Vec::new();
        for element in &self.values[range] {
            match element {
                InputNode::Symbol(s) => result.push(s.to_string()),
                _ => (),
            }
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use input_tree::{input_node::InputNode, row::InputRow};

    #[test]
    fn test_lexer() {
        let layout = InputRow::new(vec![
            InputNode::Symbol("a".to_string()),
            InputNode::Fraction([
                InputRow::new(vec![InputNode::Symbol("b".to_string())]),
                InputRow::new(vec![InputNode::Symbol("c".to_string())]),
            ]),
        ]);

        let mut lexer = Lexer::new(&layout.values);
        let mut token = lexer.begin_token();
        assert_eq!(
            token.get_slice().get(0),
            Some(&InputNode::Symbol("a".to_string()))
        );
        token.consume_n(1);
        lexer = token.end_token().unwrap();
        assert_eq!(
            lexer.get_slice().get(0),
            Some(&InputNode::Fraction([
                InputRow::new(vec![InputNode::Symbol("b".to_string())]),
                InputRow::new(vec![InputNode::Symbol("c".to_string())]),
            ]))
        );
        lexer.consume_n(1);
        assert_eq!(lexer.get_slice().get(0), None);
    }
}