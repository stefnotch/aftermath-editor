use core::fmt;
use std::collections::HashMap;

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
                // TODO: Range
                range: (0, 0),
            },
            _ => panic!("unexpected element"),
        },
        None => MathSemantic {
            name: "empty".to_string(),
            args: vec![],
            value: vec![],
            range: (0, 0),
        },
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

        let definition = match context.binding_power(operator, (true, true)) {
            Some(v) => v,
            None => panic!("unexpected operator {}", operator),
        };

        // Not super elegant, but it works
        if definition.binding_power.0.unwrap() < minimum_bp {
            break;
        }

        // Actually consume the operator
        let operator = operator.clone();
        lexer.next();

        // Parse the right operand
        let right = parse_bp(lexer, context, definition.binding_power.1.unwrap());

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
    known_tokens: HashMap<TokenKey, TokenDefinition>,
    // TODO: operators
    // functions
    // ...
}

impl<'a> ParseContext<'a> {
    pub fn new(tokens: Vec<(String, TokenDefinition)>) -> ParseContext<'a> {
        ParseContext {
            parent_context: None,
            known_tokens: tokens
                .into_iter()
                .map(|(k, v)| {
                    (
                        TokenKey {
                            pattern: k,
                            binding_power_pattern: (
                                v.binding_power.0.is_some(),
                                v.binding_power.1.is_some(),
                            ),
                        },
                        v,
                    )
                })
                .collect(),
        }
    }

    fn binding_power(&self, operator: &str, bp_pattern: (bool, bool)) -> Option<&TokenDefinition> {
        self.known_tokens
            .get(&TokenKey {
                // This does a copy, but it's fine
                pattern: operator.to_string(),
                binding_power_pattern: bp_pattern,
            })
            .or_else(|| {
                self.parent_context
                    .and_then(|v| v.binding_power(operator, bp_pattern))
            })
    }
}

impl<'a> ParseContext<'a> {
    pub fn default() -> ParseContext<'a> {
        ParseContext::new(vec![
            (
                "+".to_string(),
                TokenDefinition::new("Add".to_string(), (Some(100), Some(101))),
            ),
            (
                "-".to_string(),
                TokenDefinition::new("Subtract".to_string(), (Some(100), Some(101))),
            ),
            (
                "*".to_string(),
                TokenDefinition::new("Multiply".to_string(), (Some(200), Some(201))),
            ),
            (
                "/".to_string(),
                TokenDefinition::new("Divide".to_string(), (Some(200), Some(201))),
            ),
            (
                ".".to_string(),
                TokenDefinition::new("Ring".to_string(), (Some(501), Some(500))),
            ),
        ])
    }
}

#[derive(Hash, Eq, PartialEq)]
struct TokenKey {
    pattern: String,
    /// a constant has no binding power
    /// a prefix operator has a binding power on the right
    /// a postfix operator has a binding power on the left
    /// an infix operator has a binding power on the left and on the right
    binding_power_pattern: (bool, bool),
}

pub struct TokenDefinition {
    name: String,
    binding_power: (Option<u32>, Option<u32>),
}

impl TokenDefinition {
    pub fn new(name: String, binding_power: (Option<u32>, Option<u32>)) -> TokenDefinition {
        TokenDefinition {
            name,
            binding_power,
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

        let context = ParseContext::default();

        let parsed = parse(&layout, &context);
        println!("{}", parsed);
    }

    #[test]
    fn test_parser_empty_input() {
        let layout = Row::new(vec![]);
        let context = ParseContext::default();

        let parsed = parse(&layout, &context);
        println!("{:?}", parsed);
    }
}
