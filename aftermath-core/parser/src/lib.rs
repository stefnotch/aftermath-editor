pub mod ast_transformer;
mod grapheme_matcher;
mod lexer;
mod nfa_builder;
pub mod parse_context;
mod parse_result;
mod syntax_tree;
mod token_matcher;

use std::ops::Range;

use input_tree::{element::InputElement, row::InputRow};

use crate::lexer::Lexer;

use self::{
    parse_context::{ParseContext, TokenDefinition},
    token_matcher::MatchResult,
};

pub use self::parse_result::{ParseError, ParseErrorType, ParseResult};
pub use self::syntax_tree::SyntaxTree;

pub fn parse(input: &InputRow, context: &ParseContext) -> ParseResult<SyntaxTree> {
    // see https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html
    // we have a LL(1) pratt parser, aka we can look one token ahead
    let lexer = Lexer::new(&input.values);
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
    ) -> (SyntaxTree, Lexer<'input>) {
        println!(
            "parse_bp at {:?} with minimum_bp {}",
            lexer.get_slice(),
            minimum_bp
        );

        // bp stands for binding power
        let mut left = {
            let mut starting_token = lexer.begin_token();
            let parse_start =
                parse_bp_start(&mut starting_token, self).expect("parse start failed");
            lexer = starting_token.end_token().unwrap();

            let parse_result = parse_start.to_syntax_tree(lexer, self);
            lexer = parse_result.1;
            parse_result.0
        };

        // Repeatedly and recursively consume operators with higher binding power
        loop {
            // Not sure yet what happens when we have a postfix operator with a low binding power
            // Also not sure what happens when there's a right associative and a left associative operator with the same binding powers
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
                    // Actually consume the operator
                    lexer = operator.end_token().unwrap();

                    let left_range = left.range.clone();

                    // Parse the right operand
                    let args;
                    (args, lexer) =
                        definition.parse_arguments(lexer, self, &match_result, Some(left));

                    let range = combine_ranges(&left_range, &lexer.get_range());

                    // Combine the left and right operand into a new left operand
                    left = SyntaxTree {
                        name: definition.name(),
                        args,
                        value: (definition.value_parser)(&match_result),
                        row_index: None,
                        range,
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

                // Actually consume the operator
                lexer = operator.end_token().unwrap();

                let left_range = left.range.clone();

                let args;
                (args, lexer) = definition.parse_arguments(lexer, self, &match_result, Some(left));

                let range = combine_ranges(&left_range, &lexer.get_range());

                // Combine the left operand into a new left operand
                left = SyntaxTree {
                    name: definition.name(),
                    args,
                    value: (definition.value_parser)(&match_result),
                    row_index: None,
                    range,
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
            // - an infix operator is missing its right operand
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
struct ParseStartResult<'input, 'definition> {
    definition: &'definition TokenDefinition,
    match_result: MatchResult<'input, InputElement>,
    range: Range<usize>,
}
impl<'input, 'definition> ParseStartResult<'input, 'definition> {
    fn to_syntax_tree<'lexer>(
        self,
        lexer: Lexer<'lexer>,
        context: &ParseContext,
    ) -> (SyntaxTree, Lexer<'lexer>) {
        let (args, lexer) =
            self.definition
                .parse_arguments(lexer, context, &self.match_result, None);
        let value = (self.definition.value_parser)(&self.match_result);

        assert_eq!(lexer.get_range().start, self.range.start);
        (
            SyntaxTree {
                name: self.definition.name(),
                args,
                value,
                row_index: None,
                range: lexer.get_range(),
            },
            lexer,
        )
    }
}

/// Expects a token or an opening bracket or a prefix operator
fn parse_bp_start<'input, 'definition>(
    token: &mut Lexer<'input>,
    context: &'definition ParseContext,
) -> Result<ParseStartResult<'input, 'definition>, ParseError> {
    println!("parse_bp_start at {:?}", token.get_slice());
    if token.eof() {
        Err(ParseError {
            error: ParseErrorType::UnexpectedEndOfInput,
            range: token.get_range(),
        })
    } else if let Some((definition, match_result)) = context.get_token(token, (false, false)) {
        // Defined symbol
        let range = token.get_range();
        Ok(ParseStartResult {
            definition,
            match_result,
            range,
        })
    } else if let Some((definition, match_result)) = context.get_token(token, (false, true)) {
        // Prefix operator
        let range = token.get_range();
        Ok(ParseStartResult {
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
