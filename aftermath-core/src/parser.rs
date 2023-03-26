mod grapheme_matcher;
mod nfa_builder;
mod token_matcher;

use crate::math_layout::{element::MathElement, row::Row};
use core::fmt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use self::{nfa_builder::NFABuilder, token_matcher::NFA};

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

struct LexerToken<'a> {
    lexer: &'a mut Lexer<'a>,
    index: usize,
}

impl<'a> Lexer<'a> {
    fn new(row: &Row) -> Lexer {
        Lexer { row, index: 0 }
    }

    fn begin(&mut self) -> LexerToken {
        LexerToken {
            lexer: self,
            index: self.index,
        }
    }

    fn eof(&self) -> bool {
        self.index >= self.row.values.len()
    }
}

impl<'a> LexerToken<'a> {
    fn next(&mut self) -> Option<&MathElement> {
        let index = self.index;
        self.index += 1;
        self.lexer.row.values.get(index)
    }
    fn peek(&self) -> Option<&MathElement> {
        self.lexer.row.values.get(self.index)
    }
    fn consume(&mut self, count: usize) {
        self.index += count;
    }
    // TODO: https://doc.rust-lang.org/reference/attributes/diagnostics.html#the-must_use-attribute ?
    fn end(self) {
        assert!(self.index <= self.lexer.row.values.len());
        self.lexer.index = self.index;
    }

    fn discard(self) {}

    fn get_slice(&self) -> &[MathElement] {
        &self.lexer.row.values[self.index..]
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
    let mut left = parse_bp_start(lexer.begin(), context)
        .unwrap()
        .apply(context)
        .apply(lexer, context);

    // Repeatedly and recursively consume operators with higher binding power
    loop {
        let operator = lexer.begin();

        // Not sure yet what happens when we have a postfix operator with a low binding power

        if let Some(definition) = context.get_token(&mut operator, (true, true)) {
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
                operator.end();

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
        } else {
            operator.discard();
        }

        let operator = lexer.begin();
        if let Some(definition) = context.get_token(&mut operator, (true, false)) {
            // Postfix operator
            if definition.binding_power.0.unwrap() < minimum_bp {
                break;
            }
            // Actually consume the operator
            operator.end();

            // Combine the left operand into a new left operand
            left = MathSemantic {
                name: "operator".to_string(),
                args: vec![left],
                value: definition.name.clone().into_bytes(),
                range: (0, 0),
            };
            continue;
        } else {
            operator.discard();
        }

        // Not an operator?
        // TODO: Check closing brackets?
        break;
    }

    left
}

/// Expects a token or an opening bracket or a prefix operator
fn parse_bp_start<'a, 'b>(
    token: LexerToken<'a>,
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

type BindingPowerPattern = (bool, bool);
enum BracketType {
    Opening,
    Closing,
}

pub struct ParseContext<'a> {
    // takes ownership of the parent context and gives it back afterwards
    parent_context: Option<&'a ParseContext<'a>>,
    // TODO: Use a Hash Array Mapped Trie here (see issue #20)
    known_tokens: HashMap<BindingPowerPattern, Vec<(TokenMatcher, TokenDefinition)>>,
    known_brackets: Vec<(BracketMatcher, BracketDefinition)>,
    // functions
    // ...
}

impl<'a> ParseContext<'a> {
    pub fn new(
        tokens: Vec<(TokenMatcher, TokenDefinition)>,
        brackets: Vec<(BracketMatcher, BracketDefinition)>,
    ) -> ParseContext<'a> {
        let known_tokens =
            tokens
                .into_iter()
                .fold(HashMap::new(), |mut acc, (matcher, definition)| {
                    let entry = acc
                        .entry(definition.binding_power_pattern())
                        .or_insert(vec![]);
                    entry.push((matcher, definition));
                    acc
                });

        ParseContext {
            parent_context: None,
            known_tokens,
            known_brackets: brackets,
        }
    }

    fn get_token<'b>(
        &self,
        token: &mut LexerToken<'b>,
        bp_pattern: BindingPowerPattern,
    ) -> Option<&TokenDefinition> {
        let matches: Vec<_> = self
            .known_tokens
            .get(&bp_pattern)
            .unwrap_or(&vec![])
            .iter()
            .map(|(matcher, definition)| (matcher.pattern.matches(token.get_slice()), definition))
            .filter(|(match_length, _)| match_length > &0)
            .collect();

        if matches.len() > 1 {
            // TODO: Better error
            panic!("multiple matches for token");
        } else if matches.len() == 1 {
            let (match_length, definition) = matches[0];
            token.consume(match_length);

            Some(definition)
        } else {
            self.parent_context
                .and_then(|v| v.get_token(token, bp_pattern))
        }
    }

    fn get_bracket<'b>(
        &self,
        bracket: &mut LexerToken<'b>,
        bracket_type: BracketType,
    ) -> Option<&BracketDefinition> {
        let matches: Vec<_> = self
            .known_brackets
            .iter()
            .map(|(matcher, definition)| match bracket_type {
                BracketType::Opening => (
                    matcher.opening_pattern.matches(bracket.get_slice()),
                    definition,
                ),
                BracketType::Closing => (
                    matcher.closing_pattern.matches(bracket.get_slice()),
                    definition,
                ),
            })
            .filter(|(match_length, _)| match_length > &0)
            .collect();

        if matches.len() > 1 {
            // TODO: Better error
            panic!("multiple matches for bracket");
        } else if matches.len() == 1 {
            let (match_length, definition) = matches[0];
            bracket.consume(match_length);
            bracket.end(); // TODO: Remove

            Some(definition)
        } else {
            self.parent_context
                .and_then(|v| v.get_bracket(bracket, bracket_type))
        }
    }
}

impl<'a> ParseContext<'a> {
    pub fn default() -> ParseContext<'a> {
        ParseContext::new(
            vec![
                (
                    "+".into(),
                    TokenDefinition::new("Add".to_string(), (Some(100), Some(101))),
                ),
                (
                    "-".into(),
                    TokenDefinition::new("Subtract".to_string(), (Some(100), Some(101))),
                ),
                (
                    "+".into(),
                    TokenDefinition::new("Add".to_string(), (None, Some(400))),
                ),
                (
                    "-".into(),
                    TokenDefinition::new("Subtract".to_string(), (None, Some(400))),
                ),
                (
                    "*".into(),
                    TokenDefinition::new("Multiply".to_string(), (Some(200), Some(201))),
                ),
                (
                    "/".into(),
                    TokenDefinition::new("Divide".to_string(), (Some(200), Some(201))),
                ),
                (
                    ".".into(),
                    TokenDefinition::new("Ring".to_string(), (Some(501), Some(500))),
                ),
                (
                    "!".into(),
                    TokenDefinition::new("Ring".to_string(), (Some(600), None)),
                ),
            ],
            vec![(("(", ")").into(), BracketDefinition::new("()".to_string()))],
        )
    }
}

struct TokenMatcher {
    // 1. binding power pattern
    // 2. tricky
    // - sin is 3 symbol tokens
    // - Sum is a symbol token (with sub and sup afterwards, which end up behaving like postfix operators)
    //   Sum is a prefix operator with a low binding power. Like sum_i (i^2)
    // - d/dx is a fraction token, a symbol token, a symbol token, an unknown symbol token
    //   d/dx is a prefix operator with a low binding power. Like d/dx (x^2)
    // - d^n f / dx^n is a nasty notation
    // - hat x is a over token with two symbol tokens. All fixed, which is nice
    pattern: NFA,
}

impl From<&str> for TokenMatcher {
    fn from(pattern: &str) -> TokenMatcher {
        TokenMatcher {
            pattern: NFABuilder::match_string(pattern).build(),
        }
    }
}

pub struct TokenDefinition {
    name: String,
    /// a constant has no binding power
    /// a prefix operator has a binding power on the right
    /// a postfix operator has a binding power on the left
    /// an infix operator has a binding power on the left and on the right
    binding_power: (Option<u32>, Option<u32>),
}

impl TokenDefinition {
    pub fn new(name: String, binding_power: (Option<u32>, Option<u32>)) -> Self {
        Self {
            name,
            binding_power,
        }
    }

    fn binding_power_pattern(&self) -> (bool, bool) {
        (
            self.binding_power.0.is_some(),
            self.binding_power.1.is_some(),
        )
    }
}

struct BracketMatcher {
    opening_pattern: NFA,
    closing_pattern: NFA,
}

impl From<(&str, &str)> for BracketMatcher {
    fn from(pattern: (&str, &str)) -> Self {
        Self {
            opening_pattern: NFABuilder::match_string(pattern.0).build(),
            closing_pattern: NFABuilder::match_string(pattern.1).build(),
        }
    }
}

#[derive(Clone)]
pub struct BracketDefinition {
    name: String,
}

impl BracketDefinition {
    pub fn new(name: String) -> BracketDefinition {
        BracketDefinition { name }
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
