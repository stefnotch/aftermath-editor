mod grapheme_matcher;
mod lexer;
mod nfa;
mod nfa_builder;
mod parse_result;
pub mod parse_rules;
mod syntax_tree;
mod token_matcher;

use input_tree::row::InputRow;

use crate::{
    lexer::Lexer,
    parse_rules::{built_in_rules::BuiltInRules, TokenType},
    syntax_tree::{get_child_range_end, LeafNodeType},
};

use self::parse_rules::ParserRules;

pub use self::parse_result::{ParseError, ParseErrorType, ParseResult};
pub use self::syntax_tree::{SyntaxLeafNode, SyntaxNode, SyntaxNodes};

pub fn parse_row(input: &InputRow, context: &ParserRules) -> ParseResult<SyntaxNode> {
    // see https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html
    // we could also have used https://journal.stuffwithstuff.com/2011/03/19/pratt-parsers-expression-parsing-made-easy/ as the tutorial
    let mut lexer = Lexer::new(&input.values);
    let mut parse_result;
    (parse_result, lexer) = context.parse_bp(lexer, 0);

    if !lexer.eof() {
        // If the input is "a + \frac{b}{c}" and we don't have a plus parser,
        // then "+ \frac{b}{c}" ends up being an error and not rendered correctly/at all.
        // This is really bad, since a fraction should always be rendered as a fraction!

        // So to fix that, we'll just parse the rest of the input repeatedly.
        let mut error_children = vec![];

        while !lexer.eof() {
            let mut next_token;
            (next_token, lexer) = context.parse_bp(lexer, 0);
            if next_token.range().is_empty() {
                (next_token, lexer) = error_and_consume_one(lexer);
            }
            error_children.push(next_token);
        }

        let range = parse_result.range().start..get_child_range_end(&error_children);
        let mut children = vec![parse_result];
        children.extend(error_children);
        parse_result = BuiltInRules::parse_error_node(range, children)
    }

    println!("parse result: {:?}", parse_result);
    assert_eq!(
        parse_result.range().end,
        input.values.len(),
        "range not until end"
    );
    assert!(lexer.eof(), "lexer not at end");

    ParseResult {
        value: parse_result,
        errors: Vec::new(),
    }
}

impl<'a> ParserRules<'a> {
    fn parse_bp<'input>(
        &self,
        mut lexer: Lexer<'input>,
        minimum_bp: u32,
    ) -> (SyntaxNode, Lexer<'input>) {
        println!(
            "parse_bp at {:?} with minimum_bp {}",
            lexer.get_next_value(),
            minimum_bp
        );

        if lexer.eof() {
            return (
                SyntaxNode::new(
                    BuiltInRules::nothing_name(),
                    lexer.begin_range().end_range().range(),
                    SyntaxNodes::Leaves(vec![]),
                ),
                lexer,
            );
        }

        // bp stands for binding power
        let mut left: SyntaxNode = {
            let parse_result = if let Some((starting_range, definition)) =
                self.get_token(lexer.begin_range(), TokenType::Starting)
            {
                // Defined symbol
                let token = starting_range.end_range();
                let (args, lexer) = definition.parse_arguments(lexer, self);

                // If it's a child without any arguments, we don't need to create a container
                if args.is_empty() {
                    (definition.parse_starting_token(token, self), lexer)
                } else {
                    // Otherwise, we need to create a container
                    let range_start = token.range().start;
                    let mut children = vec![definition.parse_starting_token(token, self)];
                    children.extend(args);
                    let range = range_start..get_child_range_end(&children);

                    (
                        SyntaxNode::new(
                            definition.name(),
                            range,
                            SyntaxNodes::Containers(children),
                        ),
                        lexer,
                    )
                }
            } else {
                // Consume one token and report an error
                // TODO: Check if next node is maybe a (true, true) or (true, false) token. If so, we should instead report an error for the missing operator.
                error_and_consume_one(lexer)
            };
            lexer = parse_result.1;
            parse_result.0
        };

        // Repeatedly and recursively consume operators with higher binding power
        loop {
            // Not sure what happens when there's a right associative and a left associative operator with the same binding powers
            if let Some((operator_range, definition)) =
                self.get_token(lexer.begin_range(), TokenType::Continue)
            {
                if definition.binding_power.0.unwrap() < minimum_bp {
                    // operator_range is automatically dropped here, so we don't have to do it manually
                    break;
                }
                // Actually consume the operator
                let token = operator_range.end_range();

                let range_start = left.range().start;

                let args;
                (args, lexer) = definition.parse_arguments(lexer, self);
                // Combine the left and right operand into a new left operand
                let mut children = vec![left, definition.parse_starting_token(token, self)];
                children.extend(args);

                // Range that includes the left side, and the last child
                let range = range_start..get_child_range_end(&children);
                left = SyntaxNode::new(definition.name(), range, SyntaxNodes::Containers(children));
                continue;
            }

            println!("not expected operator {:?}", lexer.get_next_value());
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

fn error_and_consume_one(mut lexer: Lexer) -> (SyntaxNode, Lexer) {
    let mut starting_range = lexer.begin_range();
    starting_range.consume_n(1);
    let token = starting_range.end_range();
    (
        // TODO: Report an error message
        BuiltInRules::error_message_node(
            token.range(),
            vec![SyntaxLeafNode {
                node_type: LeafNodeType::Symbol,
                range: token.range(),
                symbols: token.get_symbols(),
            }],
        ),
        lexer,
    )
}
