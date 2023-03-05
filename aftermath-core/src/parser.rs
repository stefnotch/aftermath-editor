use core::fmt;

use serde::{Deserialize, Serialize};

use crate::math_layout::{element::MathElement, row::Row};

/// https://github.com/cortex-js/compute-engine/issues/25
/// mimics the math layout tree
#[derive(Debug, Serialize, Deserialize)]
pub struct MathSemantic {
    /// name of the function or constant
    pub name: String,
    /// arguments of the function
    /// if the function is a constant, this is empty
    pub args: Vec<MathSemantic>,
    /// value, especially for constants
    /// stored as bytes, and interpreted according to the name
    pub value: Vec<u8>,
    /// the range of this in the original math layout
    pub range: (usize, usize),
}

struct Lexer<'a> {
    row: &'a Row,
    index: usize,
}

impl<'a> Lexer<'a> {
    fn new(row: &Row) -> Lexer {
        Lexer { row, index: 0 }
    }

    fn next(&mut self) -> Option<&MathElement> {
        let index = self.index;
        self.index += 1;
        self.row.values.get(index)
    }
    fn peek(&self) -> Option<&MathElement> {
        self.row.values.get(self.index)
    }
}

impl fmt::Display for MathSemantic {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // S-expression
        // S here sadly doesn't stand for Stef
        write!(f, "({} ", self.name)?;
        if !self.args.is_empty() {
            for arg in &self.args {
                write!(f, " {}", arg)?;
            }
        }
        write!(f, ")")
    }
}

pub fn parse(input: &Row, context: &ParseContext) -> MathSemantic {
    // see https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html
    let mut lexer = Lexer::new(input);
    parse_bp(&mut lexer, context, 0)
}

fn parse_bp(lexer: &mut Lexer, context: &ParseContext, minimum_bp: u32) -> MathSemantic {
    // bp stands for binding power
    let mut left = match lexer.next() {
        Some(v) => match v {
            MathElement::Symbol(s) => MathSemantic {
                // TODO: put the "symbol" name into the parsing context
                name: "symbol".to_string(),
                args: vec![],
                value: s.clone().into_bytes(),
                range: (0, 0),
            },
            _ => panic!("unexpected element"),
        },
        // Well, an empty input is an immediate panic
        None => panic!("unexpected end of input"),
    };

    // Repeatedly and recursively consume operators with higher binding power
    loop {
        let operator = match lexer.peek() {
            None => break,
            Some(v) => match v {
                MathElement::Symbol(s) => s,
                _ => panic!("unexpected element"),
            },
        };

        let (left_bp, right_bp) = match context.binding_power(operator) {
            Some(v) => v,
            None => panic!("unexpected operator {}", operator),
        };

        if left_bp < minimum_bp {
            break;
        }

        // Actually consume the operator
        let operator = operator.clone();
        lexer.next();

        // Parse the right operand
        let right = parse_bp(lexer, context, right_bp);

        // Combine the left and right operand into a new left operand
        left = MathSemantic {
            name: "operator".to_string(),
            args: vec![left, right],
            value: operator.into_bytes(),
            range: (0, 0),
        };
    }

    left
}

pub struct ParseContext<'a> {
    // takes ownership of the parent context and gives it back afterwards
    parent_context: Option<&'a ParseContext<'a>>,
    // TODO: operators
    // functions
    // ...
}

impl<'a> ParseContext<'a> {
    pub fn new() -> ParseContext<'a> {
        ParseContext {
            parent_context: None,
        }
    }

    fn binding_power(&self, operator: &str) -> Option<(u32, u32)> {
        match operator {
            "+" => Some((100, 101)),
            "-" => Some((100, 101)),
            "*" => Some((200, 201)),
            "/" => Some((200, 201)),
            "." => Some((501, 500)),
            _ => self.parent_context.and_then(|v| v.binding_power(operator)),
        }
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
        assert_eq!(lexer.next(), Some(&MathElement::Symbol("a".to_string())));
        assert_eq!(
            lexer.next(),
            Some(&MathElement::Fraction([
                Row::new(vec![MathElement::Symbol("b".to_string())]),
                Row::new(vec![MathElement::Symbol("c".to_string())]),
            ]))
        );
        assert_eq!(lexer.next(), None);
    }

    #[test]
    fn test_parser() {
        let layout = Row::new(vec![
            MathElement::Symbol("a".to_string()),
            MathElement::Symbol("+".to_string()),
            MathElement::Symbol("b".to_string()),
            MathElement::Symbol("*".to_string()),
            MathElement::Symbol("c".to_string()),
        ]);

        let context = ParseContext::new();

        let parsed = parse(&layout, &context);
        println!("{}", parsed);
    }

    #[test]
    fn test_parser_empty_input() {
        let layout = Row::new(vec![]);
        let context = ParseContext::new();

        let parsed = parse(&layout, &context);
        println!("{:?}", parsed);
    }
}
