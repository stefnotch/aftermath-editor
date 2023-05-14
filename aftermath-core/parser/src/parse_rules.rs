pub mod arithmetic_rules;
pub mod built_in_rules;
pub mod core_rules;

use std::collections::HashMap;

use input_tree::{input_node::InputNode, row::RowIndex};

use crate::{
    lexer::LexerRange,
    parse_row,
    syntax_tree::{LeafNodeType, NodeIdentifier, SyntaxLeafNode},
    token_matcher::MatchError,
    SyntaxNode, SyntaxNodes,
};

use self::built_in_rules::BuiltInRules;

use super::{
    lexer::Lexer,
    nfa_builder::NFABuilder,
    token_matcher::{MatchResult, NFA},
};

pub type BindingPowerPattern = (bool, bool);
// TODO: Display tokens in a flattened, sorted way (for debugging)
pub struct ParserRules<'a> {
    // takes the parent context and gives it back afterwards
    parent_context: Option<&'a ParserRules<'a>>,
    known_tokens: HashMap<BindingPowerPattern, Vec<TokenDefinition>>,
}

/// Rules for parsing
/// Invariant:
/// - No postfix and infix token may have the same symbol. If they do, the infix token always wins.
impl<'a> ParserRules<'a> {
    pub fn new(parent_context: Option<&'a ParserRules<'a>>, tokens: Vec<TokenDefinition>) -> Self {
        let known_tokens = tokens
            .into_iter()
            .fold(HashMap::new(), |mut acc, definition| {
                let entry = acc
                    .entry(definition.binding_power_pattern())
                    .or_insert(vec![]);
                entry.push(definition);
                acc
            });

        Self {
            parent_context,
            known_tokens,
        }
    }

    pub fn get_token<'input, 'lexer>(
        &self,
        mut lexer_range: LexerRange<'input, 'lexer>,
        bp_pattern: BindingPowerPattern,
    ) -> Option<(
        LexerRange<'input, 'lexer>,
        &TokenDefinition,
        MatchResult<'input, InputNode>,
    )> {
        let matches: Vec<_> = self
            .known_tokens
            .get(&bp_pattern)?
            .iter()
            .map(|definition| {
                (
                    definition
                        .starting_parser
                        .matches(lexer_range.get_next_slice()),
                    definition,
                )
            })
            .filter_map(|(match_result, definition)| match_result.ok().map(|v| (v, definition)))
            .collect();

        if matches.len() > 1 {
            // TODO: Better error
            panic!("multiple matches for token");
        } else if matches.len() == 1 {
            let (match_result, definition) = matches.into_iter().next().unwrap();
            lexer_range.consume_n(match_result.get_length());
            Some((lexer_range, definition, match_result))
        } else {
            self.parent_context
                .and_then(|v| v.get_token(lexer_range, bp_pattern))
        }
    }

    pub fn get_symbol<'input, 'lexer>(
        &self,
        mut lexer_range: LexerRange<'input, 'lexer>,
        symbol: &NFA,
    ) -> Option<(LexerRange<'input, 'lexer>, MatchResult<'input, InputNode>)> {
        let match_result = symbol.matches(lexer_range.get_next_slice()).ok()?;
        lexer_range.consume_n(match_result.get_length());
        Some((lexer_range, match_result))
    }
}

impl<'a> ParserRules<'a> {
    pub fn default() -> ParserRules<'a> {
        // TODO: Add more default tokens
        // 3. Parser for functions
        // 4. Parser for whitespace
        // 5. Parser for chains of < <=, which could be treated as a "domain restriction"

        ParserRules::new(
            None,
            vec![
                TokenDefinition::new(
                    "String".into(),
                    (None, None),
                    // https://stackoverflow.com/questions/249791/regex-for-quoted-string-with-escaping-quotes
                    /*
                    flowchart LR
                        A(Quote &quot) --> B(Epsilon)
                        B --> C(Backslash \)
                        C --> D(Any)
                        D -->B
                        B -->F(Final Quote &quot)
                        B -->G(Other)
                        G -->B
                        */
                    StartingTokenMatcher::Token(TokenMatcher {
                        symbol: NFABuilder::match_character(('"').into())
                            .then(
                                // Skip quote
                                NFABuilder::match_character(('\0'..='!').into())
                                    .or(
                                        // Skip backslash
                                        NFABuilder::match_character(('#'..='[').into()),
                                    )
                                    .or(
                                        // Rest of Unicode characters
                                        NFABuilder::match_character((']'..=char::MAX).into()),
                                    )
                                    .or(NFABuilder::match_character('\\'.into())
                                        .then_character(('\0'..=char::MAX).into()))
                                    .zero_or_more(),
                            )
                            .then_character('"'.into())
                            .build(),
                        symbol_type: LeafNodeType::Symbol,
                    }),
                ),
                TokenDefinition::new("Tuple".into(), (Some(50), Some(51)), ','.into()),
                TokenDefinition::new("Ring".into(), (Some(501), Some(500)), '.'.into()),
                TokenDefinition::new("Factorial".into(), (Some(600), None), '!'.into()),
                // TODO: The dx at the end of an integral might not even be a closing bracket.
                // After all, it can also sometimes appear inside an integral.
                TokenDefinition::new_with_parsers(
                    "FunctionApplication".into(),
                    (Some(800), None),
                    ['('][..].into(),
                    vec![
                        Argument {
                            parser: ArgumentParserType::Next {
                                minimum_binding_power: 0,
                            },
                            argument_index: 0,
                        },
                        Argument {
                            parser: ArgumentParserType::NextToken(TokenMatcher {
                                symbol: NFABuilder::match_character(')'.into()).build(),
                                symbol_type: LeafNodeType::Operator,
                            }),
                            argument_index: 1,
                        },
                    ],
                ),
            ],
        )
    }
}

#[derive(Debug)]
pub enum StartingTokenMatcher {
    Token(TokenMatcher),
    Container(ContainerType),
}
impl StartingTokenMatcher {
    fn matches<'input>(
        &self,
        input: &'input [InputNode],
    ) -> Result<MatchResult<'input, InputNode>, MatchError> {
        match self {
            StartingTokenMatcher::Token(TokenMatcher { symbol, .. }) => symbol.matches(input),
            StartingTokenMatcher::Container(container_type) => {
                let token = input.get(0).ok_or(MatchError::NoMatch)?;
                match (container_type, token) {
                    (ContainerType::Fraction, InputNode::Fraction(_))
                    | (ContainerType::Root, InputNode::Root(_))
                    | (ContainerType::Under, InputNode::Under(_))
                    | (ContainerType::Over, InputNode::Over(_))
                    | (ContainerType::Sup, InputNode::Sup(_))
                    | (ContainerType::Sub, InputNode::Sub(_))
                    | (ContainerType::Table, InputNode::Table { .. }) => {
                        Ok(MatchResult::new(&input[0..1]))
                    }
                    _ => Err(MatchError::NoMatch),
                }
            }
        }
    }

    pub fn from_characters(characters: Vec<char>, symbol_type: LeafNodeType) -> Self {
        Self::Token(TokenMatcher {
            symbol: characters
                .iter()
                .map(|c| NFABuilder::match_character((*c).into()))
                .reduce(|a, b| a.concat(b))
                .unwrap()
                .build(),
            symbol_type,
        })
    }

    pub fn from_character(character: char, symbol_type: LeafNodeType) -> Self {
        Self::Token(TokenMatcher {
            symbol: NFABuilder::match_character(character.into()).build(),
            symbol_type,
        })
    }

    pub fn operator_from_character(character: char) -> Self {
        Self::Token(TokenMatcher {
            symbol: NFABuilder::match_character(character.into()).build(),
            symbol_type: LeafNodeType::Operator,
        })
    }
}

#[derive(Debug)]
pub struct TokenMatcher {
    symbol: NFA,
    pub symbol_type: LeafNodeType,
}

#[derive(Debug)]
pub struct TokenDefinition {
    pub name: NodeIdentifier,
    /// (None, None) is a constant
    /// (None, Some) is a prefix operator
    /// (Some, None) is a postfix operator
    /// (Some, Some) is an infix operator
    pub binding_power: (Option<u32>, Option<u32>),
    pub starting_parser: StartingTokenMatcher,
    pub arguments_parsers: Vec<Argument>,
    argument_count: usize,
}

#[derive(Debug)]
pub struct Argument {
    // Can parse
    // - next token for prefix operators
    // - next token for infix operators
    // - nothing for tokens
    // - stuff in brackets for brackets, and then the closing bracket
    // - bottom part of lim

    // Does not parse
    // - sup and sub that come after a sum, because those are postfix operators
    argument_index: usize,
    parser: ArgumentParserType,
}

#[derive(Debug)]
pub enum ArgumentParserType {
    Next { minimum_binding_power: u32 },
    NextToken(TokenMatcher),
}

#[derive(Debug, Eq, PartialEq)]
pub enum ContainerType {
    Fraction,
    Root,
    Under,
    Over,
    Sup,
    Sub,
    Table,
}

struct TokenArgumentParseResult<'lexer> {
    argument_index: usize,
    argument: SyntaxNode,
    lexer: Lexer<'lexer>,
}

pub fn operator_syntax_node(leaf_node: SyntaxLeafNode) -> SyntaxNode {
    assert!(leaf_node.node_type == LeafNodeType::Operator);
    SyntaxNode::new(
        BuiltInRules::operator_name(),
        leaf_node.range(),
        SyntaxNodes::Leaves(vec![leaf_node]),
    )
}

impl Argument {
    fn parse<'lexer, 'input>(
        &self,
        mut lexer: Lexer<'lexer>,
        context: &ParserRules,
    ) -> TokenArgumentParseResult<'lexer> {
        match self {
            Argument {
                parser:
                    ArgumentParserType::Next {
                        minimum_binding_power,
                    },
                argument_index,
            } => {
                let (argument, lexer) = context.parse_bp(lexer, *minimum_binding_power);
                TokenArgumentParseResult {
                    argument_index: *argument_index,
                    argument,
                    lexer,
                }
            }
            Argument {
                parser:
                    ArgumentParserType::NextToken(TokenMatcher {
                        symbol,
                        symbol_type,
                    }),
                argument_index,
            } => {
                if let Some((lexer_range, _match_result)) =
                    context.get_symbol(lexer.begin_range(), symbol)
                {
                    let token = lexer_range.end_range();
                    let argument = SyntaxLeafNode {
                        node_type: symbol_type.clone(),
                        range: token.range.clone(),
                        symbols: token.get_symbols(),
                    };
                    TokenArgumentParseResult {
                        argument_index: *argument_index,
                        // TODO: This is wrong
                        argument: operator_syntax_node(argument),
                        lexer,
                    }
                } else {
                    let token = lexer.begin_range().end_range();
                    // TODO: Report this error properly?
                    TokenArgumentParseResult {
                        argument_index: *argument_index,
                        argument: SyntaxNode::new(
                            BuiltInRules::error_name(),
                            token.range.clone(),
                            SyntaxNodes::Leaves(vec![]),
                        ),
                        lexer,
                    }
                }
            }
        }
    }
}

impl TokenDefinition {
    pub fn new(
        name: NodeIdentifier,
        binding_power: (Option<u32>, Option<u32>),
        starting_parser: StartingTokenMatcher,
    ) -> Self {
        let arguments_parser = match binding_power {
            // infix
            (Some(_), Some(minimum_binding_power)) => vec![Argument {
                parser: ArgumentParserType::Next {
                    minimum_binding_power,
                },
                argument_index: 0,
            }],
            // prefix
            (None, Some(minimum_binding_power)) => vec![Argument {
                parser: ArgumentParserType::Next {
                    minimum_binding_power,
                },
                argument_index: 0,
            }],
            // postfix
            (Some(_), None) => vec![],
            // symbol
            (None, None) => vec![],
        };

        Self::new_with_parsers(name, binding_power, starting_parser, arguments_parser)
    }

    pub fn new_with_parsers(
        name: NodeIdentifier,
        binding_power: (Option<u32>, Option<u32>),
        starting_parser: StartingTokenMatcher,
        arguments_parsers: Vec<Argument>,
    ) -> Self {
        let mut argument_indices: Vec<_> =
            arguments_parsers.iter().map(|v| v.argument_index).collect();

        argument_indices.sort();
        assert_eq!(
            argument_indices,
            (0..argument_indices.len()).collect::<Vec<_>>()
        );

        Self {
            name,
            binding_power,
            starting_parser,
            arguments_parsers,
            argument_count: argument_indices.len(),
        }
    }

    fn binding_power_pattern(&self) -> (bool, bool) {
        (
            self.binding_power.0.is_some(),
            self.binding_power.1.is_some(),
        )
    }

    pub fn name(&self) -> NodeIdentifier {
        (&self.name).clone()
    }

    pub fn parse_arguments<'lexer, 'input>(
        &self,
        mut lexer: Lexer<'lexer>,
        context: &ParserRules,
        token_match_results: &MatchResult<'input, InputNode>,
    ) -> (Vec<SyntaxNode>, Lexer<'lexer>) {
        // TODO: This is a bit of a mess
        if self.is_container() {
            let token = match token_match_results.get_input() {
                [InputNode::Symbol(_)] => panic!("expected container token"),
                [token] => token,
                _ => panic!("expected single token"),
            };
            let token_index = {
                // TODO: This is a bit of a mess
                let lexer_end = lexer.begin_range().end_range().range().start;
                assert!(lexer_end > 0);
                lexer_end - 1
            };

            let arguments: Vec<_> = token
                .rows()
                .iter()
                .enumerate()
                .map(|(row_index, row)| {
                    let row_parse_result = parse_row(row, context);
                    // TODO: Bubble up the row_parse_result.errors
                    let syntax_tree = row_parse_result
                        .value
                        .with_row_index(RowIndex(token_index, row_index));
                    syntax_tree
                })
                .collect();
            (arguments, lexer)
        } else {
            // Fill arguments with dummies
            let mut arguments = std::iter::repeat_with(|| None)
                .take(self.argument_count)
                .collect::<Vec<_>>();

            // And then set the argument values
            for parser in &self.arguments_parsers {
                // TODO: If something expected was not found (e.g. a closing bracket), this should report the appropriate error
                // And it should not consume anything
                let parse_result = parser.parse(lexer, context);

                lexer = parse_result.lexer;
                arguments[parse_result.argument_index] = Some(parse_result.argument);
            }

            (
                arguments.into_iter().collect::<Option<Vec<_>>>().unwrap(),
                lexer,
            )
        }
    }

    pub fn is_container(&self) -> bool {
        match self.starting_parser {
            StartingTokenMatcher::Token(_) => false,
            StartingTokenMatcher::Container(_) => true,
        }
    }
}
