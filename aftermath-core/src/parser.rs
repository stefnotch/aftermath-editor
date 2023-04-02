mod grapheme_matcher;
mod lexer;
mod math_semantic;
mod nfa_builder;
mod parse_result;
mod token_matcher;

use crate::{
    math_layout::{element::MathElement, row::Row},
    parser::lexer::Lexer,
};
use std::{collections::HashMap, ops::Range};

use self::{
    math_semantic::MathSemantic,
    nfa_builder::NFABuilder,
    parse_result::{ParseError, ParseErrorType, ParseResult},
    token_matcher::{MatchResult, NFA},
};

pub fn parse(input: &Row, context: &ParseContext) -> ParseResult<MathSemantic> {
    // see https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html
    // we have a LL(1) pratt parser, aka we can look one token ahead
    let lexer = Lexer::new(input);
    let (parse_result, lexer) = parse_bp(lexer, context, 0);
    assert_eq!(
        parse_result.range.end,
        input.values.len(),
        "range not until end"
    );
    assert!(lexer.eof(), "lexer not at end");
    ParseResult {
        value: parse_result,
        errors: Vec::new(),
    }
}

fn parse_bp<'a>(
    mut lexer: Lexer<'a>,
    context: &ParseContext,
    minimum_bp: u32,
) -> (MathSemantic, Lexer<'a>) {
    // bp stands for binding power
    let mut left = {
        let mut starting_token = lexer.begin_token();
        let parse_start = parse_bp_start(&mut starting_token, context).unwrap();
        lexer = starting_token.end_token().unwrap();
        let parse_result = parse_start.to_math_semantic(lexer, context);
        lexer = parse_result.1;
        parse_result.0
    };

    // Repeatedly and recursively consume operators with higher binding power
    loop {
        // Not sure yet what happens when we have a postfix operator with a low binding power

        let mut operator = lexer.begin_token();
        if let Some((definition, _)) = context.get_token(&mut operator, (true, true)) {
            // Infix operators only get applied if there is something valid after them
            // So we check if the next parsing step would be successful, while avoiding consuming the token
            let mut next_token = operator.begin_token();
            let symbol_comes_next = parse_bp_start(&mut next_token, context).is_ok();
            operator = next_token.discard_token().unwrap();
            if symbol_comes_next {
                // Infix operator
                // Not super elegant, but it works
                if definition.binding_power.0.unwrap() < minimum_bp {
                    lexer = operator.discard_token().unwrap();
                    break;
                }

                // Actually consume the operator
                lexer = operator.end_token().unwrap();

                // Parse the right operand
                let result = parse_bp(lexer, context, definition.binding_power.1.unwrap());
                let right = result.0;
                lexer = result.1;

                // Combine the left and right operand into a new left operand
                left = MathSemantic {
                    name: definition.name.clone(),
                    args: vec![left, right],
                    value: definition.name.clone().into_bytes(),
                    range: (0..0), // TODO: Range
                };
                continue;
            } else {
                lexer = operator.discard_token().unwrap();
            }
        } else {
            lexer = operator.discard_token().unwrap();
        }

        let mut operator = lexer.begin_token();
        if let Some((definition, _)) = context.get_token(&mut operator, (true, false)) {
            // Postfix operator
            if definition.binding_power.0.unwrap() < minimum_bp {
                lexer = operator.discard_token().unwrap();
                break;
            }
            // Actually consume the operator
            lexer = operator.end_token().unwrap();

            // Combine the left operand into a new left operand
            left = MathSemantic {
                name: definition.name.clone(),
                args: vec![left],
                value: definition.name.clone().into_bytes(),
                range: (0..0), // TODO: Range
            };
            continue;
        } else {
            lexer = operator.discard_token().unwrap();
        }

        // Not an expected operator
        // This can happen when
        // - the minimum binding power is too high, in which case we should return to the caller
        // - there's a closing bracket, in which case we should return to the caller
        // - there's an actual error, which we'll have to handle sometime
        break;
    }

    (left, lexer)
}

#[derive(Debug)]
pub enum ParseStartResult<'input, 'definition> {
    Token {
        definition: &'definition TokenDefinition,
        match_result: MatchResult<'input, MathElement>,
        minimum_bp: u32,
        range: Range<usize>,
    },
    Bracket {
        definition: &'definition BracketDefinition,
        match_result: MatchResult<'input, MathElement>,
        range: Range<usize>,
    },
}
impl<'input, 'definition> ParseStartResult<'input, 'definition> {
    fn to_math_semantic<'lexer>(
        self,
        lexer: Lexer<'lexer>,
        context: &ParseContext,
    ) -> (MathSemantic, Lexer<'lexer>) {
        let (args, lexer) = match self {
            ParseStartResult::Token { definition, .. } => {
                (definition.arguments_parser)(lexer, context, &self)
            }
            ParseStartResult::Bracket { .. } => (vec![], lexer),
        };
        let value = match self {
            ParseStartResult::Token {
                definition,
                ref match_result,
                ..
            } => (definition.value_parser)(match_result),
            ParseStartResult::Bracket { .. } => vec![],
        };

        match self {
            ParseStartResult::Token {
                definition,
                match_result: _,
                minimum_bp: _,
                range,
            } => (
                MathSemantic {
                    name: definition.name.clone(),
                    args,
                    value,
                    range,
                },
                lexer,
            ),
            ParseStartResult::Bracket {
                definition,
                match_result: _,
                range,
            } => (
                MathSemantic {
                    name: definition.name.clone(),
                    args,
                    value,
                    range,
                },
                lexer,
            ),
        }
    }
}

/// Expects a token or an opening bracket or a prefix operator
fn parse_bp_start<'input, 'definition>(
    token: &mut Lexer<'input>,
    context: &'definition ParseContext,
) -> Result<ParseStartResult<'input, 'definition>, ParseError> {
    let start_index = token.get_index();
    let get_range = |length: usize| start_index..(start_index + length);
    if token.eof() {
        Err(ParseError {
            error: ParseErrorType::UnexpectedEndOfInput,
            range: get_range(0),
        })
    } else if let Some((definition, match_result)) = context.get_token(token, (false, false)) {
        // Defined symbol
        let range = get_range(match_result.get_length());
        Ok(ParseStartResult::Token {
            definition,
            match_result,
            minimum_bp: definition.binding_power.0.unwrap(),
            range,
        })
    } else if let Some((definition, match_result)) = context.get_token(token, (false, true)) {
        // Prefix operator
        let range = get_range(match_result.get_length());
        Ok(ParseStartResult::Token {
            definition,
            match_result,
            minimum_bp: definition.binding_power.1.unwrap(),
            range,
        })
    } else if let Some((definition, match_result)) =
        context.get_bracket(token, BracketType::Opening)
    {
        // Bracket opening
        // TODO: quotes are like brackets
        let range = get_range(match_result.get_length());
        Ok(ParseStartResult::Bracket {
            definition,
            match_result,
            range,
        })
    } else {
        Err(ParseError {
            error: ParseErrorType::UnexpectedToken,
            // TODO: Better range for error reporting
            range: get_range(0),
        })
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

    fn get_token<'input>(
        &self,
        token: &mut Lexer<'input>,
        bp_pattern: BindingPowerPattern,
    ) -> Option<(&TokenDefinition, MatchResult<'input, MathElement>)> {
        let matches: Vec<_> = self
            .known_tokens
            .get(&bp_pattern)?
            .iter()
            .map(|(matcher, definition)| (matcher.pattern.matches(token.get_slice()), definition))
            .filter_map(|(match_result, definition)| match_result.ok().map(|v| (v, definition)))
            .collect();

        if matches.len() > 1 {
            // TODO: Better error
            panic!("multiple matches for token");
        } else if matches.len() == 1 {
            let (match_result, definition) = matches.into_iter().next().unwrap();
            token.consume_n(match_result.get_length());

            Some((definition, match_result))
        } else {
            self.parent_context
                .and_then(|v| v.get_token(token, bp_pattern))
        }
    }

    fn get_bracket<'input>(
        &self,
        bracket: &mut Lexer<'input>,
        bracket_type: BracketType,
    ) -> Option<(&BracketDefinition, MatchResult<'input, MathElement>)> {
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
            .filter_map(|(match_result, definition)| match_result.ok().map(|v| (v, definition)))
            .collect();

        if matches.len() > 1 {
            // TODO: Better error
            panic!("multiple matches for bracket");
        } else if matches.len() == 1 {
            let (match_result, definition) = matches.into_iter().next().unwrap();
            bracket.consume_n(match_result.get_length());

            Some((definition, match_result))
        } else {
            self.parent_context
                .and_then(|v| v.get_bracket(bracket, bracket_type))
        }
    }
}

impl<'a> ParseContext<'a> {
    pub fn default() -> ParseContext<'a> {
        // TODO:
        // 1. Parser for variables (names)
        // 2. Parser for various types of tokens (numbers, strings, etc.)
        // 3. Parser for functions

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

pub struct TokenMatcher {
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

#[derive(Debug)]
pub struct TokenDefinition {
    name: String,
    /// a constant has no binding power
    /// a prefix operator has a binding power on the right
    /// a postfix operator has a binding power on the left
    /// an infix operator has a binding power on the left and on the right
    binding_power: (Option<u32>, Option<u32>),

    arguments_parser: TokenDefinitionArgumentParser,
    value_parser: TokenDefinitionValueParser,
}

pub type TokenDefinitionArgumentParser =
    for<'a> fn(Lexer<'a>, &ParseContext, &ParseStartResult) -> (Vec<MathSemantic>, Lexer<'a>);

pub type TokenDefinitionValueParser =
    for<'input> fn(match_result: &MatchResult<'input, MathElement>) -> Vec<u8>;

// TODO: Maybe this is a useless design?
fn no_arguments_parser<'a>(
    lexer: Lexer<'a>,
    context: &ParseContext,
    _: &ParseStartResult,
) -> (Vec<MathSemantic>, Lexer<'a>) {
    (vec![], lexer)
}

fn prefix_arguments_parser<'a>(
    lexer: Lexer<'a>,
    context: &ParseContext,
    start: &ParseStartResult,
) -> (Vec<MathSemantic>, Lexer<'a>) {
    let (argument, lexer) = parse_bp(
        lexer,
        context,
        match start {
            ParseStartResult::Token { minimum_bp, .. } => *minimum_bp,
            ParseStartResult::Bracket { .. } => todo!(),
        },
    );
    (vec![argument], lexer)
}

fn no_value_parser<'input>(match_result: &MatchResult<'input, MathElement>) -> Vec<u8> {
    vec![]
}

impl TokenDefinition {
    pub fn new(name: String, binding_power: (Option<u32>, Option<u32>)) -> Self {
        let arguments_parser = match binding_power {
            (Some(_), Some(_)) => no_arguments_parser,
            (Some(_), None) => prefix_arguments_parser,
            (None, Some(_)) => no_arguments_parser,
            (None, None) => no_arguments_parser,
        };

        Self::new_with_parsers(name, binding_power, arguments_parser, no_value_parser)
    }

    pub fn new_with_parsers(
        name: String,
        binding_power: (Option<u32>, Option<u32>),
        arguments_parser: TokenDefinitionArgumentParser,
        value_parser: TokenDefinitionValueParser,
    ) -> Self {
        Self {
            name,
            binding_power,
            arguments_parser,
            value_parser,
        }
    }

    fn binding_power_pattern(&self) -> (bool, bool) {
        (
            self.binding_power.0.is_some(),
            self.binding_power.1.is_some(),
        )
    }
}

pub struct BracketMatcher {
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

#[derive(Debug, Clone)]
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

    // TODO: Fix those tests to actually do something instead of printing stuff
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
        println!("{}", parsed.value);
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
