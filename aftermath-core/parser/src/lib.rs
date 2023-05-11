pub mod ast_transformer;
mod grapheme_matcher;
mod lexer;
mod nfa_builder;
pub mod parse_context;
mod parse_result;
mod syntax_tree;
mod token_matcher;

use std::ops::Range;

use input_tree::{input_node::InputNode, row::InputRow};

use crate::{lexer::Lexer, syntax_tree::LeafNodeType};

use self::{
    parse_context::{ParserRules, TokenDefinition},
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
            lexer.get_slice(),
            minimum_bp
        );

        if lexer.eof() {
            return (
                SyntaxContainerNode::new("Nothing".into(), lexer.get_range().start, vec![]),
                lexer,
            );
        }

        // bp stands for binding power
        let mut left: SyntaxContainerNode = {
            let mut starting_token = lexer.begin_token();

            let parse_result = if let Some((definition, match_result)) =
                self.get_token(&mut starting_token, (false, false))
            {
                // Defined symbol
                let range = starting_token.get_range();
                let symbols = starting_token.get_symbols();
                lexer = starting_token.end_token().unwrap();
                ParseStartResult {
                    definition,
                    match_result,
                    range,
                    symbols,
                }
                .to_syntax_tree(lexer, self)
            } else if let Some((definition, match_result)) =
                self.get_token(&mut starting_token, (false, true))
            {
                // Prefix operator
                let range = starting_token.get_range();
                let symbols = starting_token.get_symbols();
                lexer = starting_token.end_token().unwrap();
                ParseStartResult {
                    definition,
                    match_result,
                    range,
                    symbols,
                }
                .to_syntax_tree(lexer, self)
            } else {
                // Consume one token and report an error
                starting_token.consume_n(1);
                let range = starting_token.get_range();
                let symbols = starting_token.get_symbols();
                lexer = starting_token.end_token().unwrap();
                (
                    // TODO: Document this node
                    SyntaxContainerNode::new(
                        "Error".into(),
                        range.start,
                        vec![SyntaxNode::Leaf(SyntaxLeafNode {
                            node_type: LeafNodeType::Symbol,
                            range: range.clone(),
                            symbols: symbols,
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
            let mut operator = lexer.begin_token();
            if let Some((definition, match_result)) = self.get_token(&mut operator, (true, true)) {
                // Infix operators only get applied if there is something valid after them
                // So we check if the next parsing step would be successful, while avoiding consuming the token
                let mut next_token = operator.begin_token();
                let symbol_comes_next = is_starting_token_next(&mut next_token, self);
                operator = next_token.discard_token().unwrap();
                if symbol_comes_next {
                    // Infix operator
                    // Not super elegant, but it works
                    if definition.binding_power.0.unwrap() < minimum_bp {
                        lexer = operator.discard_token().unwrap();
                        break;
                    }
                    let operator_range = operator.get_range();
                    let operator_symbols = operator.get_symbols();
                    // Actually consume the operator
                    lexer = operator.end_token().unwrap();

                    let left_range = left.range().clone();

                    // Parse the right operand
                    let args;
                    (args, lexer) = definition.parse_arguments(lexer, self, &match_result);

                    // Combine the left and right operand into a new left operand
                    let mut children = vec![
                        SyntaxNode::Container(left),
                        SyntaxNode::Leaf(SyntaxLeafNode {
                            node_type: definition.get_symbol_type().into(),
                            range: operator_range,
                            symbols: operator_symbols,
                        }),
                    ];
                    children.extend(args);

                    left = SyntaxContainerNode::new(definition.name(), left_range.start, children);
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
                let operator_range = operator.get_range();
                let operator_symbols = operator.get_symbols();

                // Actually consume the operator
                lexer = operator.end_token().unwrap();

                let left_range = left.range();

                let args;
                (args, lexer) = definition.parse_arguments(lexer, self, &match_result);

                // Combine the left operand into a new left operand
                let mut children = vec![
                    SyntaxNode::Container(left),
                    SyntaxNode::Leaf(SyntaxLeafNode {
                        node_type: definition.get_symbol_type().into(),
                        range: operator_range,
                        symbols: operator_symbols,
                    }),
                ];
                children.extend(args);

                left = SyntaxContainerNode::new(definition.name(), left_range.start, children);
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
        (
            SyntaxContainerNode::new(self.definition.name(), lexer.get_range().start, children),
            lexer,
        )
    }
}

fn is_starting_token_next<'input, 'definition>(
    token: &mut Lexer<'input>,
    context: &'definition ParserRules,
) -> bool {
    if token.eof() {
        return false;
    }
    return context.get_token(token, (false, false)).is_some()
        || context.get_token(token, (false, true)).is_some();
}
