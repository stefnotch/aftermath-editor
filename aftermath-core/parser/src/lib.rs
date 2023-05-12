pub mod ast_transformer;
mod grapheme_matcher;
mod lexer;
mod nfa_builder;
mod parse_result;
pub mod parse_rules;
mod syntax_tree;
mod token_matcher;

use std::ops::Range;

use input_tree::{input_node::InputNode, row::InputRow};
use lexer::LexerRange;

use crate::{
    lexer::Lexer,
    syntax_tree::{get_child_range_end, LeafNodeType},
};

use self::{
    parse_rules::{ParserRules, TokenDefinition},
    token_matcher::MatchResult,
};

pub use self::parse_result::{ParseError, ParseErrorType, ParseResult};
pub use self::syntax_tree::{SyntaxContainerNode, SyntaxLeafNode, SyntaxNode};

pub fn parse(input: &InputRow, context: &ParserRules) -> ParseResult<SyntaxContainerNode> {
    // see https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html
    // we have a LL(1) pratt parser, aka we can look one token ahead
    let lexer = Lexer::new(&input.values);
    let (parse_result, lexer) = context.parse_bp(lexer, 0);
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
    ) -> (SyntaxContainerNode, Lexer<'input>) {
        println!(
            "parse_bp at {:?} with minimum_bp {}",
            lexer.get_next_value(),
            minimum_bp
        );

        if lexer.eof() {
            // TODO: Document this node
            return (
                SyntaxContainerNode::new("Nothing".into(), lexer.get_range(), vec![]),
                lexer,
            );
        }

        // bp stands for binding power
        let mut left: SyntaxContainerNode = {
            let parse_result = if let Some((starting_range, definition, match_result)) =
                self.get_token(lexer.begin_range(), (false, false))
            {
                // Defined symbol
                let token = starting_range.end_range();
                ParseStartResult {
                    definition,
                    match_result,
                    range: token.range.clone(),
                    symbols: token.get_symbols(),
                }
                .to_syntax_tree(lexer, self)
            } else if let Some((starting_range, definition, match_result)) =
                self.get_token(lexer.begin_range(), (false, true))
            {
                // Prefix operator
                let token = starting_range.end_range();
                ParseStartResult {
                    definition,
                    match_result,
                    range: token.range.clone(),
                    symbols: token.get_symbols(),
                }
                .to_syntax_tree(lexer, self)
            } else {
                // Consume one token and report an error
                let mut starting_range = lexer.begin_range();
                starting_range.consume_n(1);
                let token = starting_range.end_range();
                (
                    // TODO: Document this node
                    SyntaxContainerNode::new(
                        "Error".into(),
                        token.range.clone(),
                        vec![SyntaxNode::Leaf(SyntaxLeafNode {
                            node_type: LeafNodeType::Symbol,
                            range: token.range.clone(),
                            symbols: token.get_symbols(),
                        })],
                    ),
                    lexer,
                )
            };
            lexer = parse_result.1;
            parse_result.0
        };

        // Repeatedly and recursively consume operators with higher binding power
        loop {
            // Not sure yet what happens when we have a postfix operator with a low binding power
            // Also not sure what happens when there's a right associative and a left associative operator with the same binding powers
            if let Some((mut operator_range, definition, match_result)) =
                self.get_token(lexer.begin_range(), (true, true))
            {
                // Infix operators only get applied if there is something valid after them
                // So we check if the next parsing step would be successful, while avoiding consuming the token
                let symbol_comes_next =
                    is_starting_token_next(operator_range.begin_subrange(), self);
                if symbol_comes_next {
                    // Infix operator
                    // Not super elegant, but it works
                    if definition.binding_power.0.unwrap() < minimum_bp {
                        // operator_range is automatically dropped here, so we don't have to do it manually
                        break;
                    }
                    // Actually consume the operator
                    let token = operator_range.end_range();

                    let range_start = left.range().start;

                    // Parse the right operand
                    let args;
                    (args, lexer) = definition.parse_arguments(lexer, self, &match_result);

                    // Combine the left and right operand into a new left operand
                    let mut children = vec![
                        SyntaxNode::Container(left),
                        SyntaxNode::Leaf(SyntaxLeafNode {
                            node_type: definition.get_symbol_type().into(),
                            range: token.range.clone(),
                            symbols: token.get_symbols(),
                        }),
                    ];
                    children.extend(args);

                    // Range that includes the left side, and the last child
                    let range = range_start..get_child_range_end(&children);
                    left = SyntaxContainerNode::new(definition.name(), range, children);
                    continue;
                }
            }

            if let Some((operator_range, definition, match_result)) =
                self.get_token(lexer.begin_range(), (true, false))
            {
                // Postfix operator
                if definition.binding_power.0.unwrap() < minimum_bp {
                    // operator_range is automatically dropped here, so we don't have to do it manually
                    break;
                }

                // Actually consume the operator
                let token = operator_range.end_range();

                let range_start = left.range().start;

                let args;
                (args, lexer) = definition.parse_arguments(lexer, self, &match_result);

                // Combine the left operand into a new left operand
                let mut children = vec![
                    SyntaxNode::Container(left),
                    SyntaxNode::Leaf(SyntaxLeafNode {
                        node_type: definition.get_symbol_type().into(),
                        range: token.range.clone(),
                        symbols: token.get_symbols(),
                    }),
                ];
                children.extend(args);

                let range = range_start..get_child_range_end(&children);
                left = SyntaxContainerNode::new(definition.name(), range, children);
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

#[derive(Debug)]
struct ParseStartResult<'input, 'definition> {
    definition: &'definition TokenDefinition,
    match_result: MatchResult<'input, InputNode>,
    range: Range<usize>,
    symbols: Vec<String>,
}
impl<'input, 'definition> ParseStartResult<'input, 'definition> {
    fn to_syntax_tree<'lexer>(
        self,
        lexer: Lexer<'lexer>,
        context: &ParserRules,
    ) -> (SyntaxContainerNode, Lexer<'lexer>) {
        let (args, lexer) = self
            .definition
            .parse_arguments(lexer, context, &self.match_result);

        let mut children = vec![SyntaxNode::Leaf(SyntaxLeafNode {
            node_type: self.definition.get_symbol_type().into(),
            range: self.range.clone(),
            symbols: self.symbols,
        })];
        children.extend(args);

        assert_eq!(lexer.get_range().start, self.range.start);

        let range = self.range.start..get_child_range_end(&children);
        (
            SyntaxContainerNode::new(self.definition.name(), range, children),
            lexer,
        )
    }
}

fn is_starting_token_next<'input, 'definition>(
    mut lexer_range: LexerRange<'input, 'definition>,
    context: &'definition ParserRules,
) -> bool {
    if lexer_range.lexer().eof() {
        return false;
    }
    return context
        .get_token(lexer_range.begin_subrange(), (false, false))
        .is_some()
        || context
            .get_token(lexer_range.begin_subrange(), (false, true))
            .is_some();
}
