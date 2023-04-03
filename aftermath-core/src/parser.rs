mod grapheme_matcher;
mod lexer;
mod math_semantic;
mod nfa_builder;
pub mod parse_context;
mod parse_result;
mod token_matcher;

use crate::{
    math_layout::{element::MathElement, row::Row},
    parser::lexer::Lexer,
};
use std::ops::Range;

use self::{
    math_semantic::MathSemantic,
    parse_context::{BracketDefinition, ParseContext, TokenDefinition},
    parse_result::{ParseError, ParseErrorType, ParseResult},
    token_matcher::MatchResult,
};

pub fn parse(input: &Row, context: &ParseContext) -> ParseResult<MathSemantic> {
    // see https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html
    // we have a LL(1) pratt parser, aka we can look one token ahead
    let lexer = Lexer::new(input);
    let (parse_result, lexer) = context.parse_bp(lexer, 0);
    println!("parse result: {:?}", parse_result);
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

impl<'a> ParseContext<'a> {
    fn parse_bp<'input>(
        &self,
        mut lexer: Lexer<'input>,
        minimum_bp: u32,
    ) -> (MathSemantic, Lexer<'input>) {
        println!(
            "parse_bp at {:?} with minimum_bp {}",
            lexer.get_slice(),
            minimum_bp
        );

        // bp stands for binding power
        let mut left = {
            let mut starting_token = lexer.begin_token();
            let parse_start = parse_bp_start(&mut starting_token, self).unwrap();
            lexer = starting_token.end_token().unwrap();
            let parse_result = parse_start.to_math_semantic(lexer, self);
            lexer = parse_result.1;
            parse_result.0
        };

        // Repeatedly and recursively consume operators with higher binding power
        loop {
            // Not sure yet what happens when we have a postfix operator with a low binding power

            let mut operator = lexer.begin_token();
            if let Some((definition, match_result)) = self.get_token(&mut operator, (true, true)) {
                // Infix operators only get applied if there is something valid after them
                // So we check if the next parsing step would be successful, while avoiding consuming the token
                let mut next_token = operator.begin_token();
                let symbol_comes_next = parse_bp_start(&mut next_token, self).is_ok();
                operator = next_token.discard_token().unwrap();
                if symbol_comes_next {
                    // Infix operator
                    // Not super elegant, but it works
                    if definition.binding_power.0.unwrap() < minimum_bp {
                        lexer = operator.discard_token().unwrap();
                        break;
                    }
                    let mut combined_range = combine_ranges(&left.range, &operator.get_range());
                    // Actually consume the operator
                    lexer = operator.end_token().unwrap();

                    // Parse the right operand
                    let right_lexer = lexer.begin_token();
                    let result = self.parse_bp(right_lexer, definition.binding_power.1.unwrap());
                    let right = result.0;
                    lexer = result.1.end_token().unwrap();

                    combined_range = combine_ranges(&combined_range, &right.range);
                    // Combine the left and right operand into a new left operand
                    left = MathSemantic {
                        name: definition.name(),
                        args: vec![left, right],
                        value: (definition.value_parser)(&match_result),
                        range: combined_range,
                    };
                    continue;
                } else {
                    lexer = operator.discard_token().unwrap();
                }
            } else {
                lexer = operator.discard_token().unwrap();
            }

            let mut operator = lexer.begin_token();
            if let Some((definition, match_result)) = self.get_token(&mut operator, (true, false)) {
                // Postfix operator
                if definition.binding_power.0.unwrap() < minimum_bp {
                    lexer = operator.discard_token().unwrap();
                    break;
                }

                let combined_range = combine_ranges(&left.range, &operator.get_range());
                // Actually consume the operator
                lexer = operator.end_token().unwrap();
                // Combine the left operand into a new left operand
                left = MathSemantic {
                    name: definition.name(),
                    args: vec![left],
                    value: (definition.value_parser)(&match_result),
                    range: combined_range,
                };
                continue;
            } else {
                lexer = operator.discard_token().unwrap();
            }

            println!("not expected operator {:?}", lexer.get_slice());
            // Not an expected operator
            // This can happen when
            // - the minimum binding power is too high, in which case we should return to the caller
            // - there's a closing bracket, in which case we should return to the caller
            // - there's an actual error, which we'll have to handle sometime
            break;
        }

        (left, lexer)
    }
}
fn combine_ranges(range_1: &Range<usize>, range_2: &Range<usize>) -> Range<usize> {
    let start = range_1.start.min(range_2.start);
    let end = range_1.end.max(range_2.end);
    start..end
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
            ParseStartResult::Bracket { definition, .. } => {
                (definition.arguments_parser)(lexer, context, &self)
            }
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
            } => {
                assert_eq!(lexer.get_range().start, range.start);
                (
                    MathSemantic {
                        name: definition.name(),
                        args,
                        value,
                        range: lexer.get_range(),
                    },
                    lexer,
                )
            }
            ParseStartResult::Bracket {
                definition,
                match_result: _,
                range,
            } => {
                assert_eq!(lexer.get_range().start, range.start);
                (
                    MathSemantic {
                        name: definition.name(),
                        args,
                        value,
                        range: lexer.get_range(),
                    },
                    lexer,
                )
            }
        }
    }
}

/// Expects a token or an opening bracket or a prefix operator
fn parse_bp_start<'input, 'definition>(
    token: &mut Lexer<'input>,
    context: &'definition ParseContext,
) -> Result<ParseStartResult<'input, 'definition>, ParseError> {
    if token.eof() {
        Err(ParseError {
            error: ParseErrorType::UnexpectedEndOfInput,
            range: token.get_range(),
        })
    } else if let Some((definition, match_result)) = context.get_token(token, (false, false)) {
        // Defined symbol
        let range = token.get_range();
        Ok(ParseStartResult::Token {
            definition,
            match_result,
            minimum_bp: 0,
            range,
        })
    } else if let Some((definition, match_result)) = context.get_token(token, (false, true)) {
        // Prefix operator
        let range = token.get_range();
        Ok(ParseStartResult::Token {
            definition,
            match_result,
            minimum_bp: definition.binding_power.1.unwrap(),
            range,
        })
    } else if let Some((definition, match_result)) = context.get_opening_bracket(token) {
        // Bracket opening
        let range = token.get_range();
        Ok(ParseStartResult::Bracket {
            definition,
            match_result,
            range,
        })
    } else {
        Err(ParseError {
            error: ParseErrorType::UnexpectedToken,
            // TODO: Better range for error reporting
            range: token.get_range(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        math_layout::{element::MathElement, row::Row},
        parser::parse_context::ParseContext,
    };

    #[test]
    fn test_parser() {
        let layout = Row::new(vec![
            MathElement::Symbol("-".to_string()),
            MathElement::Symbol("b".to_string()),
            MathElement::Symbol("*".to_string()),
            MathElement::Symbol("C".to_string()),
        ]);

        let context = ParseContext::default();

        let parsed = parse(&layout, &context);
        assert_eq!(
            parsed.value.to_string(),
            "(Multiply () (Subtract () (Variable (62))) (Variable (43)))"
        );
        assert_eq!(parsed.errors.len(), 0);
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
        assert_eq!(
            parsed.value.to_string(),
            "(() () (() () (() () (Factorial () (Variable (61))))))"
        );
        assert_eq!(parsed.errors.len(), 0);
    }

    // TODO: Fix those tests to actually do something instead of printing stuff
    #[test]
    fn test_parser_empty_input() {
        let layout = Row::new(vec![]);
        let context = ParseContext::default();

        let parsed = parse(&layout, &context);
        assert_eq!(parsed.errors.len(), 1);

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
