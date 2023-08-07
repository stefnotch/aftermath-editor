use std::ops::Range;

use input_tree::node::InputNode;

pub struct Lexer<'input> {
    values: &'input [InputNode],
    /// the index of the *next* element to be consumed
    index: usize,
}

impl<'input> Lexer<'input> {
    pub fn new(row: &[InputNode]) -> Lexer {
        Lexer {
            values: row,
            index: 0,
        }
    }

    pub fn begin_range<'lexer>(&'lexer mut self) -> LexerRange<'input, 'lexer> {
        let index = self.index;
        LexerRange {
            lexer: self,
            range: index..index,
        }
    }

    pub fn get_next_value(&self) -> Option<&'input InputNode> {
        self.values.get(self.index)
    }

    pub fn eof(&self) -> bool {
        self.index >= self.values.len()
    }
}

// TODO: With that, the lexer could take ownership of the input
pub struct LexerRange<'input, 'lexer> {
    lexer: &'lexer mut Lexer<'input>,
    range: Range<usize>,
}

impl<'input, 'lexer> LexerRange<'input, 'lexer> {
    pub fn begin_subrange<'sublexer>(&'sublexer mut self) -> LexerRange<'input, 'sublexer> {
        let index = self.range.end;
        LexerRange {
            lexer: self.lexer,
            range: index..index,
        }
    }

    pub fn end_range(self) -> LexerToken<'input> {
        self.lexer.index = self.range.end;

        let value = &self.lexer.values[self.range.clone()];
        LexerToken {
            value,
            range: self.range,
        }
    }

    pub fn lexer(&self) -> &Lexer<'input> {
        self.lexer
    }

    pub fn consume_n(&mut self, count: usize) {
        self.range.end += count;
        assert!(self.range.end <= self.lexer.values.len());
    }

    /// Gets a slice with all the *next* elements
    pub fn get_next_slice(&self) -> &'input [InputNode] {
        &self.lexer.values[self.range.end..]
    }
}

pub struct LexerToken<'input> {
    pub value: &'input [InputNode],
    pub range: Range<usize>,
}

impl<'input> LexerToken<'input> {
    pub fn get_symbols(&self) -> Vec<String> {
        let mut result = Vec::new();
        for element in &self.value[..] {
            match element {
                InputNode::Symbol(s) => result.push(s.to_string()),
                _ => (),
            }
        }
        result
    }

    pub fn range(&self) -> Range<usize> {
        self.range.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use input_tree::{node::InputNode, row::InputRow};

    #[test]
    fn test_lexer_slicing() {
        let layout = InputRow::new(vec![
            InputNode::symbol("a"),
            InputNode::fraction([
                InputRow::new(vec![InputNode::symbol("b")]),
                InputRow::new(vec![InputNode::symbol("c")]),
            ]),
        ]);

        let mut lexer = Lexer::new(&layout.values);
        let mut lexer_range = lexer.begin_range();
        assert_eq!(
            lexer_range.lexer().get_next_value(),
            Some(&InputNode::symbol("a"))
        );
        assert_eq!(
            lexer_range.get_next_slice().get(0),
            Some(&InputNode::symbol("a"))
        );
        lexer_range.consume_n(1);
        assert_eq!(
            lexer_range.lexer().get_next_value(),
            Some(&InputNode::symbol("a"))
        );
        assert_eq!(
            lexer_range.get_next_slice().get(0),
            Some(&InputNode::fraction([
                InputRow::new(vec![InputNode::symbol("b")]),
                InputRow::new(vec![InputNode::symbol("c")]),
            ]))
        );
        let _token = lexer_range.end_range();
    }

    #[test]
    fn test_lexer_token() {
        let layout = InputRow::new(vec![
            InputNode::symbol("a"),
            InputNode::fraction([
                InputRow::new(vec![InputNode::symbol("b")]),
                InputRow::new(vec![InputNode::symbol("c")]),
            ]),
        ]);

        let mut lexer = Lexer::new(&layout.values);
        let mut lexer_range = lexer.begin_range();
        lexer_range.consume_n(1);
        let token = lexer_range.end_range();
        assert_eq!(token.value.get(0), Some(&InputNode::symbol("a")));
        assert_eq!(
            lexer.get_next_value(),
            Some(&InputNode::fraction([
                InputRow::new(vec![InputNode::symbol("b")]),
                InputRow::new(vec![InputNode::symbol("c")]),
            ]))
        );
    }

    #[test]
    fn test_lexer_second_token() {
        let layout = InputRow::new(vec![InputNode::symbol("a"), InputNode::symbol("b")]);

        let mut lexer = Lexer::new(&layout.values);
        {
            let mut lexer_range = lexer.begin_range();
            lexer_range.consume_n(1);
            let _token = lexer_range.end_range();
        }
        let mut lexer_range = lexer.begin_range();
        assert_eq!(
            lexer_range.get_next_slice().get(0),
            Some(&InputNode::symbol("b"))
        );
        assert_eq!(
            lexer_range.lexer.get_next_value(),
            Some(&InputNode::symbol("b"))
        );
        lexer_range.consume_n(1);
        assert_eq!(lexer_range.get_next_slice().get(0), None);
        assert_eq!(
            lexer_range.lexer.get_next_value(),
            Some(&InputNode::symbol("b"))
        );
        let token = lexer_range.end_range();
        assert_eq!(lexer.get_next_value(), None);
        assert_eq!(token.value.get(0), Some(&InputNode::symbol("b")));
    }
}
