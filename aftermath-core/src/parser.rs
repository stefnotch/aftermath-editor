mod grapheme_matcher;
mod nfa_builder;
mod token_matcher;

use crate::math_layout::{element::MathElement, row::Row};
use core::fmt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// TODO:
// 1. Parser for variables (names)
// 2. Parser for various types of tokens (numbers, strings, etc.)

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

/// Lets us delay parsing of arguments
/// Split into two "stages" because of borrowing and ownership
/// Typestate pattern go brr https://cliffle.com/blog/rust-typestate/
struct MathSemanticContinuation<S: SemanticContinuationState> {
    math_semantic: MathSemantic,
    parse_args: fn(&mut Lexer, &ParseContext, u32) -> Vec<MathSemantic>,
    minimum_bp: u32,
    extra: S,
}

struct SubRows<'a> {
    sub_rows: Vec<&'a Row>,
}

struct Finish;

trait SemanticContinuationState {}
impl<'a> SemanticContinuationState for SubRows<'a> {}
impl<'a> SemanticContinuationState for Finish {}

impl<'a> MathSemanticContinuation<SubRows<'a>> {
    fn apply(self, context: &ParseContext) -> MathSemanticContinuation<Finish> {
        let mut math_semantic = self.math_semantic;
        math_semantic.args = self
            .extra
            .sub_rows
            .iter()
            .map(|v| parse_bp(&mut Lexer::new(v), context, 0))
            .collect();
        MathSemanticContinuation {
            math_semantic,
            parse_args: self.parse_args,
            minimum_bp: self.minimum_bp,
            extra: Finish,
        }
    }
}

impl<'a> MathSemanticContinuation<Finish> {
    fn apply(self, lexer: &mut Lexer, context: &ParseContext) -> MathSemantic {
        let mut math_semantic = self.math_semantic;
        math_semantic.args = (self.parse_args)(lexer, context, self.minimum_bp);
        math_semantic
    }
}

pub struct ParseResult<T> {
    pub value: T,
    pub errors: Vec<ParseError>,
}

#[derive(Debug, Clone)]
pub struct ParseError {
    pub error: ParseErrorType,
    /// the range of this in the original math layout
    pub range: (usize, usize),
}

#[derive(Debug, Clone)]
pub enum ParseErrorType {
    UnexpectedEndOfInput,
    UnexpectedPostfixOperator,
    Custom(String),
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
    /// peek_n with an offset of zero does the same as peek
    fn peek_n(&self, offset: usize) -> Option<&MathElement> {
        self.row.values.get(self.index + offset)
    }
    fn eof(&self) -> bool {
        self.index >= self.row.values.len()
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
    // we have a LL(1) pratt parser, aka we can look one token ahead
    let mut lexer = Lexer::new(input);
    let parse_result = parse_bp(&mut lexer, context, 0);
    assert!(lexer.eof(), "lexer not at end");
    parse_result
}

fn parse_bp(lexer: &mut Lexer, context: &ParseContext, minimum_bp: u32) -> MathSemantic {
    // bp stands for binding power
    let mut left = parse_bp_start(lexer.next(), context)
        .unwrap()
        .apply(context)
        .apply(lexer, context);

    // Repeatedly and recursively consume operators with higher binding power
    loop {
        let operator = match lexer.peek() {
            None => break,
            Some(v) => match v {
                MathElement::Symbol(s) => s,
                v => panic!("unexpected element {:?}", v),
            },
        };

        // Not sure yet what happens when we have a postfix operator with a low binding power

        if let Some(definition) = context.get_token_definition(operator, (true, true)) {
            // Infix operators only get applied if there is something valid after them
            // So we check if the next parsing step would be successful, while avoiding consuming the token
            let symbol_comes_next = parse_bp_start(lexer.peek_n(1), context).is_ok();
            if symbol_comes_next {
                // Infix operator
                // Not super elegant, but it works
                if definition.binding_power.0.unwrap() < minimum_bp {
                    break;
                }

                // Actually consume the operator
                lexer.next();

                // Parse the right operand
                let right = parse_bp(lexer, context, definition.binding_power.1.unwrap());

                // Combine the left and right operand into a new left operand
                left = MathSemantic {
                    name: "operator".to_string(),
                    args: vec![left, right],
                    value: definition.name.clone().into_bytes(),
                    range: (0, 0),
                };
                continue;
            }
        }

        if let Some(definition) = context.get_token_definition(operator, (true, false)) {
            // Postfix operator
            if definition.binding_power.0.unwrap() < minimum_bp {
                break;
            }
            // Actually consume the operator
            lexer.next();

            // Combine the left operand into a new left operand
            left = MathSemantic {
                name: "operator".to_string(),
                args: vec![left],
                value: definition.name.clone().into_bytes(),
                range: (0, 0),
            };
            continue;
        }

        // Not an operator?
        // TODO: Check closing brackets?
        break;
    }

    left
}

/// Expects a token or an opening bracket or a prefix operator
fn parse_bp_start<'a, 'b>(
    token: Option<&'a MathElement>,
    context: &'b ParseContext,
    // TODO: Use ParseResult here, so that you can report multiple errors, and always can return a value
) -> Result<MathSemanticContinuation<SubRows<'a>>, ParseError> {
    match token {
        Some(v) => match v {
            MathElement::Symbol(s) => {
                if let Some(definition) = context.get_token_definition(s, (false, false)) {
                    // Defined symbol
                    Ok(MathSemanticContinuation {
                        math_semantic: MathSemantic {
                            // TODO: put the "symbol" name into the parsing context
                            name: "symbol".to_string(),
                            args: vec![],
                            value: definition.name.clone().into_bytes(),
                            // TODO: Range
                            range: (0, 0),
                        },
                        parse_args: |_, _, _| vec![],
                        minimum_bp: 0,
                        extra: SubRows { sub_rows: vec![] },
                    })
                } else if let Some(definition) = context.get_token_definition(s, (false, true)) {
                    // Prefix operator
                    Ok(MathSemanticContinuation {
                        math_semantic: MathSemantic {
                            name: "operator".to_string(),
                            args: vec![],
                            value: definition.name.clone().into_bytes(),
                            range: (0, 0),
                        },
                        parse_args: |a, b, c| vec![parse_bp(a, b, c)],
                        minimum_bp: definition.binding_power.1.unwrap(),
                        extra: SubRows { sub_rows: vec![] },
                    })
                } else if let Some(definition) =
                    context.get_bracket_definition(s, BracketType::Opening)
                {
                    // Bracket opening
                    // TODO: quotes are like brackets

                    Ok(MathSemanticContinuation {
                        // This gives me one slightly redundant layer of nesting for brackets, but it's not a big deal
                        math_semantic: MathSemantic {
                            name: "bracket".to_string(),
                            args: vec![],
                            value: definition.name.clone().into_bytes(),
                            range: (0, 0),
                        },
                        parse_args: |a, b, c| {
                            let left = vec![parse_bp(a, b, c)];
                            a.next(); // TODO: Do this instead: assert_eq!(a.next(), Some(&definition.closing_bracket));
                            left
                        },
                        minimum_bp: 0,
                        extra: SubRows { sub_rows: vec![] },
                    })
                } else {
                    // Undefined symbol
                    // TODO: What if that symbol is a postfix operator or an infix operator?
                    Ok(MathSemanticContinuation {
                        math_semantic: MathSemantic {
                            name: "symbol".to_string(),
                            args: vec![],
                            value: s.clone().into_bytes(),
                            // TODO: Range
                            range: (0, 0),
                        },
                        parse_args: |_, _, _| vec![],
                        minimum_bp: 0,
                        extra: SubRows { sub_rows: vec![] },
                    })
                }
            }
            MathElement::Fraction([top, bottom]) => Ok(MathSemanticContinuation {
                math_semantic: MathSemantic {
                    name: "fraction".to_string(),
                    args: vec![],
                    value: vec![],
                    range: (0, 0),
                },
                parse_args: |_, _, _| vec![],
                minimum_bp: 0,
                extra: SubRows {
                    sub_rows: vec![top, bottom],
                },
            }),
            MathElement::Sup(_) | MathElement::Sub(_) => Err(ParseError {
                error: ParseErrorType::UnexpectedPostfixOperator,
                range: (0, 0),
            }),
            _ => panic!("unexpected element"),
        },
        None => Err(ParseError {
            error: ParseErrorType::UnexpectedEndOfInput,
            range: (0, 0),
        }),
    }
}

pub struct ParseContext<'a> {
    // takes ownership of the parent context and gives it back afterwards
    parent_context: Option<&'a ParseContext<'a>>,
    // TODO: Use a Hash Array Mapped Trie here (see issue #20)
    known_tokens: HashMap<TokenKey, TokenDefinition>,
    known_brackets: HashMap<BracketKey, BracketDefinition>,
    // functions
    // ...
}

impl<'a> ParseContext<'a> {
    pub fn new(
        // TODO: Compute the string from the token definition
        tokens: Vec<(String, TokenDefinition)>,
        brackets: Vec<(String, BracketDefinition)>,
    ) -> ParseContext<'a> {
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
            known_brackets: brackets
                .into_iter()
                .flat_map(|(k, v)| {
                    vec![
                        (
                            BracketKey {
                                pattern: k.clone(),
                                bracket_type: BracketType::Opening,
                            },
                            // TODO: This is a copy
                            v.clone(),
                        ),
                        (
                            BracketKey {
                                pattern: k,
                                bracket_type: BracketType::Closing,
                            },
                            v,
                        ),
                    ]
                })
                .collect(),
        }
    }

    fn get_token_definition(
        &self,
        operator: &str,
        bp_pattern: (bool, bool),
    ) -> Option<&TokenDefinition> {
        self.known_tokens
            .get(&TokenKey {
                // This does a copy, but it's fine
                pattern: operator.to_string(),
                binding_power_pattern: bp_pattern,
            })
            .or_else(|| {
                self.parent_context
                    .and_then(|v| v.get_token_definition(operator, bp_pattern))
            })
    }

    fn get_bracket_definition(
        &self,
        bracket: &str,
        bracket_type: BracketType,
    ) -> Option<&BracketDefinition> {
        self.known_brackets
            .get(&BracketKey {
                // This does a copy, but it's fine
                pattern: bracket.to_string(),
                bracket_type,
            })
            .or_else(|| {
                self.parent_context
                    .and_then(|v| v.get_bracket_definition(bracket, bracket_type))
            })
    }
}

impl<'a> ParseContext<'a> {
    pub fn default() -> ParseContext<'a> {
        ParseContext::new(
            vec![
                (
                    "+".to_string(),
                    TokenDefinition::new("Add".to_string(), (Some(100), Some(101))),
                ),
                (
                    "-".to_string(),
                    TokenDefinition::new("Subtract".to_string(), (Some(100), Some(101))),
                ),
                (
                    "+".to_string(),
                    TokenDefinition::new("Add".to_string(), (None, Some(400))),
                ),
                (
                    "-".to_string(),
                    TokenDefinition::new("Subtract".to_string(), (None, Some(400))),
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
                (
                    "!".to_string(),
                    TokenDefinition::new("Ring".to_string(), (Some(600), None)),
                ),
            ],
            vec![(
                "(".to_string(),
                BracketDefinition::new("()".to_string(), "(".to_string(), ")".to_string()),
            )],
        )
    }
}

#[derive(Hash, Eq, PartialEq)]
struct TokenKey {
    // TODO: Turn into Trie?
    // 1. binding power pattern
    // 2. tricky
    // - sin is 3 symbol tokens
    // - Sum is a symbol token (with sub and sup afterwards, which end up behaving like postfix operators)
    //   Sum is a prefix operator with a low binding power. Like sum_i (i^2)
    // - d/dx is a fraction token, a symbol token, a symbol token, an unknown symbol token
    //   d/dx is a prefix operator with a low binding power. Like d/dx (x^2)
    // - d^n f / dx^n is a nasty notation
    // - hat x is a over token with two symbol tokens. All fixed, which is nice
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

#[derive(Hash, Eq, PartialEq)]
struct BracketKey {
    pattern: String,
    bracket_type: BracketType,
}

#[derive(Hash, Eq, PartialEq, Clone, Copy)]
enum BracketType {
    Opening,
    Closing,
}

#[derive(Clone)]
pub struct BracketDefinition {
    name: String,
    // TODO: Have a parser or something for this
    opening_bracket: MathElement,
    closing_bracket: MathElement,
}

impl BracketDefinition {
    pub fn new(
        name: String,
        opening_bracket: String,
        closing_bracket: String,
    ) -> BracketDefinition {
        BracketDefinition {
            name,
            opening_bracket: MathElement::Symbol(opening_bracket),
            closing_bracket: MathElement::Symbol(closing_bracket),
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
            MathElement::Symbol("-".to_string()),
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

    #[test]
    fn test_parser_nested_brackets_and_postfix() {
        let layout = Row::new(vec![
            MathElement::Symbol("(".to_string()),
            MathElement::Symbol("(".to_string()),
            MathElement::Symbol("(".to_string()),
            MathElement::Symbol("a".to_string()),
            MathElement::Symbol("!".to_string()),
            MathElement::Symbol(")".to_string()),
            MathElement::Symbol(")".to_string()),
            MathElement::Symbol(")".to_string()),
        ]);
        let context = ParseContext::default();

        let parsed = parse(&layout, &context);
        println!("{:?}", parsed);
    }

    #[test]
    fn test_parser_symbol_and_close_bracket() {
        let layout = Row::new(vec![
            MathElement::Symbol("a".to_string()),
            MathElement::Symbol(")".to_string()),
        ]);
        let context = ParseContext::default();

        let parsed = parse(&layout, &context);
        println!("{:?}", parsed);
    }

    #[test]
    fn test_parser_close_bracket() {
        let layout = Row::new(vec![MathElement::Symbol(")".to_string())]);
        let context = ParseContext::default();

        let parsed = parse(&layout, &context);
        println!("{:?}", parsed);
    }
}
