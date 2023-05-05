use std::collections::HashMap;

use input_tree::{element::InputElement, row::RowIndex};

use crate::{grapheme_matcher::GraphemeMatcher, token_matcher::MatchError};

use super::{
    lexer::Lexer,
    nfa_builder::NFABuilder,
    syntax_tree::SyntaxTree,
    token_matcher::{CapturingGroupId, MatchResult, NFA},
};

pub type BindingPowerPattern = (bool, bool);
// TODO: Display tokens in a flattened, sorted way (for debugging)
pub struct ParseContext<'a> {
    // takes the parent context and gives it back afterwards
    parent_context: Option<&'a ParseContext<'a>>,
    known_tokens: HashMap<BindingPowerPattern, Vec<(TokenMatcher, TokenDefinition)>>,
}

impl<'a> ParseContext<'a> {
    pub fn new(
        parent_context: Option<&'a ParseContext<'a>>,
        tokens: Vec<(TokenMatcher, TokenDefinition)>,
    ) -> Self {
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

        Self {
            parent_context,
            known_tokens,
        }
    }

    pub fn get_token<'input>(
        &self,
        token: &mut Lexer<'input>,
        bp_pattern: BindingPowerPattern,
    ) -> Option<(&TokenDefinition, MatchResult<'input, InputElement>)> {
        let matches: Vec<_> = self
            .known_tokens
            .get(&bp_pattern)?
            .iter()
            .map(|(matcher, definition)| (matcher.matches(token.get_slice()), definition))
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

    pub fn get_symbol<'input>(
        &self,
        lexer: &mut Lexer<'input>,
        symbol: &NFA,
    ) -> Option<MatchResult<'input, InputElement>> {
        let match_result = symbol.matches(lexer.get_slice()).ok()?;
        lexer.consume_n(match_result.get_length());
        Some(match_result)
    }
}

impl<'a> ParseContext<'a> {
    pub fn default() -> ParseContext<'a> {
        // TODO: Add more default tokens
        // 3. Parser for functions
        // 4. Parser for whitespace
        // 5. Parser for chains of < <=, which could be treated as a "domain restriction"

        ParseContext::new(
            None,
            vec![
                // TODO: Good whitespace handling
                /*(
                    TokenMatcher::Pattern( NFABuilder::match_character((' ').into()).build(),
                ),
                    TokenDefinition::new(minimal_definitions.empty.clone(), (None, None)),
                ),*/
                (
                    TokenMatcher::Pattern(
                        NFABuilder::match_character(GraphemeMatcher::IdentifierStart)
                            .then(
                                NFABuilder::match_character(GraphemeMatcher::IdentifierContinue)
                                    .zero_or_more(),
                            )
                            .build(),
                    ),
                    TokenDefinition::new("Variable".into(), (None, None)).with_value_parser(|v| {
                        v.get_input()
                            .iter()
                            .map(|v| match v {
                                InputElement::Symbol(v) => v.clone(),
                                _ => panic!("expected variable"),
                            })
                            .collect::<String>()
                            .into()
                    }),
                ),
                (
                    TokenMatcher::Pattern(
                        NFABuilder::match_character(('0'..='9').into())
                            .one_or_more()
                            .then(
                                NFABuilder::match_character('.'.into())
                                    .then(
                                        NFABuilder::match_character(('0'..='9').into())
                                            .one_or_more(),
                                    )
                                    .optional(),
                            )
                            .build(),
                    ),
                    TokenDefinition::new("Number".into(), (None, None)).with_value_parser(|v| {
                        v.get_input()
                            .iter()
                            .map(|v| match v {
                                InputElement::Symbol(v) => v.clone(),
                                _ => panic!("expected variable"),
                            })
                            .collect::<String>()
                            .into()
                    }),
                ),
                (
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
                    TokenMatcher::Pattern(
                        NFABuilder::match_character(('"').into())
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
                    ),
                    TokenDefinition::new("String".into(), (None, None)).with_value_parser(|v| {
                        v.get_input()
                            .iter()
                            .map(|v| match v {
                                InputElement::Symbol(v) => v.clone(),
                                _ => panic!("expected variable"),
                            })
                            .collect::<String>()
                            .into()
                    }),
                ),
                (
                    ','.into(),
                    TokenDefinition::new("Tuple".into(), (Some(50), Some(51))),
                ),
                (
                    '+'.into(),
                    TokenDefinition::new("Add".into(), (Some(100), Some(101))),
                ),
                (
                    '-'.into(),
                    TokenDefinition::new("Subtract".into(), (Some(100), Some(101))),
                ),
                (
                    '+'.into(),
                    TokenDefinition::new("Add".into(), (None, Some(400))),
                ),
                (
                    '-'.into(),
                    TokenDefinition::new("Subtract".into(), (None, Some(400))),
                ),
                (
                    '*'.into(),
                    TokenDefinition::new("Multiply".into(), (Some(200), Some(201))),
                ),
                (
                    '/'.into(),
                    TokenDefinition::new("Divide".into(), (Some(200), Some(201))),
                ),
                (
                    '.'.into(),
                    TokenDefinition::new("Ring".into(), (Some(501), Some(500))),
                ),
                (
                    '!'.into(),
                    TokenDefinition::new("Factorial".into(), (Some(600), None)),
                ),
                (
                    TokenMatcher::Container(ContainerType::Fraction),
                    TokenDefinition::new("Fraction".into(), (None, None)).with_is_container(),
                ),
                // Amusingly, if someone defines the closing bracket as a postfix operator, it'll break the brackets
                // Brackets
                (
                    // Unit tuple
                    ['(', ')'][..].into(),
                    TokenDefinition::new("RoundBrackets".into(), (None, None)),
                ),
                (
                    '('.into(),
                    TokenDefinition::new_with_parsers(
                        "RoundBrackets".into(),
                        (None, None),
                        vec![
                            TokenArgumentParser::Next {
                                minimum_binding_power: 0,
                                argument_index: Some(0),
                            },
                            TokenArgumentParser::NextSymbol {
                                name: "".into(),
                                symbol: NFABuilder::match_character(')'.into()).build(),
                                argument_index: None,
                            },
                        ],
                    ),
                ),
                (
                    ['('][..].into(),
                    TokenDefinition::new_with_parsers(
                        "FunctionApplication".into(),
                        (Some(800), None),
                        vec![
                            TokenArgumentParser::Previous {
                                argument_index: Some(0),
                            },
                            TokenArgumentParser::Next {
                                minimum_binding_power: 0,
                                argument_index: Some(1),
                            },
                            TokenArgumentParser::NextSymbol {
                                name: "".into(),
                                symbol: NFABuilder::match_character(')'.into()).build(),
                                argument_index: None,
                            },
                        ],
                    ),
                ),
            ],
        )
    }
}

/// Matches the starting pattern of a given token, including brackets
pub enum TokenMatcher {
    // 1. binding power pattern
    // 2. tricky
    // - sin is 3 symbol tokens
    // - Sum is a symbol token (with sub and sup afterwards, which end up behaving like postfix operators)
    //   Sum is a prefix operator with a low binding power. Like sum_i (i^2)
    // - d/dx is a fraction token, a symbol token, a symbol token, an unknown symbol token
    //   d/dx is a prefix operator with a low binding power. Like d/dx (x^2)
    // - d^n f / dx^n is a nasty notation
    // - hat x is a over token with two symbol tokens. All fixed, which is nice
    Pattern(NFA),
    Container(ContainerType),
}
impl TokenMatcher {
    fn matches<'input>(
        &self,
        input: &'input [InputElement],
    ) -> Result<MatchResult<'input, InputElement>, MatchError> {
        match self {
            TokenMatcher::Pattern(pattern) => pattern.matches(input),
            TokenMatcher::Container(container_type) => {
                let token = input.get(0).ok_or(MatchError::NoMatch)?;
                match (container_type, token) {
                    (ContainerType::Fraction, InputElement::Fraction(_))
                    | (ContainerType::Root, InputElement::Root(_))
                    | (ContainerType::Under, InputElement::Under(_))
                    | (ContainerType::Over, InputElement::Over(_))
                    | (ContainerType::Sup, InputElement::Sup(_))
                    | (ContainerType::Sub, InputElement::Sub(_))
                    | (ContainerType::Table, InputElement::Table { .. }) => {
                        Ok(MatchResult::new(&input[0..1], vec![]))
                    }
                    _ => Err(MatchError::NoMatch),
                }
            }
        }
    }
}

impl From<&[char]> for TokenMatcher {
    fn from(pattern: &[char]) -> TokenMatcher {
        TokenMatcher::Pattern(
            pattern
                .iter()
                .map(|c| NFABuilder::match_character((*c).into()))
                .reduce(|a, b| a.concat(b))
                .unwrap()
                .build(),
        )
    }
}

impl From<char> for TokenMatcher {
    fn from(pattern: char) -> TokenMatcher {
        TokenMatcher::Pattern(NFABuilder::match_character(pattern.into()).build())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TokenIdentifier {
    pub name: String,
}

impl From<&str> for TokenIdentifier {
    fn from(name: &str) -> TokenIdentifier {
        TokenIdentifier {
            name: name.to_string(),
        }
    }
}

impl From<&TokenIdentifier> for String {
    fn from(name: &TokenIdentifier) -> String {
        name.name.clone()
    }
}

#[derive(Debug)]
pub struct TokenDefinition {
    pub name: TokenIdentifier,
    /// a constant has no binding power
    /// a prefix operator has a binding power on the right
    /// a postfix operator has a binding power on the left
    /// an infix operator has a binding power on the left and on the right
    pub binding_power: (Option<u32>, Option<u32>),
    // Not the most elegant design, but hey
    is_container: bool,
    pub arguments_parsers: Vec<TokenArgumentParser>,
    argument_count: usize,
    pub value_parser: TokenDefinitionValueParser,
}

#[derive(Debug)]
pub enum TokenArgumentParser {
    // Can parse
    // - next token for prefix operators
    // - next token for infix operators
    // - nothing for tokens
    // - stuff in brackets for brackets, and then the closing bracket
    // - bottom part of lim
    // - infix and postfix operators using the previous token

    // Does not parse
    // - sup and sub that come after a sum, because those are postfix operators
    Previous {
        argument_index: Option<usize>,
    },
    Next {
        minimum_binding_power: u32,
        argument_index: Option<usize>,
    },
    NextSymbol {
        name: String,
        symbol: NFA,
        argument_index: Option<usize>,
    },
    /// For capturing groups that are a part of the token itself.
    /// In the case of a (None, None) token, it's obvious what that means.
    /// In the case of an operator token, it refers to the capturing groups that are a part of the operator.
    CapturingGroup {
        group_id: CapturingGroupId,
        argument_index: Option<usize>,
    },
}

#[derive(Debug)]
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
    argument_index: Option<usize>,
    argument: SyntaxTree,
    lexer: Lexer<'lexer>,
}

impl TokenArgumentParser {
    fn parse<'lexer, 'input>(
        &self,
        lexer: Lexer<'lexer>,
        context: &ParseContext,
        token_match_results: &MatchResult<'input, InputElement>,
        previous_token: &mut Option<SyntaxTree>,
    ) -> TokenArgumentParseResult<'lexer> {
        match self {
            TokenArgumentParser::Next {
                minimum_binding_power,
                argument_index,
            } => {
                let argument_lexer = lexer.begin_token();
                let (argument, argument_lexer) =
                    context.parse_bp(argument_lexer, *minimum_binding_power);
                TokenArgumentParseResult {
                    argument_index: *argument_index,
                    argument,
                    lexer: argument_lexer.end_token().unwrap(),
                }
            }
            TokenArgumentParser::NextSymbol {
                name,
                symbol,
                argument_index,
            } => {
                let mut lexer = lexer.begin_token();
                if let Some(_match_result) = context.get_symbol(&mut lexer, symbol) {
                    // Yay
                } else {
                    // TODO: Better error message
                    panic!("expected closing bracket");
                }
                let range = lexer.get_range();
                let lexer = lexer.end_token().unwrap();
                let argument = SyntaxTree {
                    name: name.clone(),
                    args: vec![],
                    value: vec![],
                    row_index: None,
                    range,
                };
                TokenArgumentParseResult {
                    argument_index: *argument_index,
                    argument,
                    lexer,
                }
            }
            TokenArgumentParser::CapturingGroup {
                group_id,
                argument_index,
            } => {
                let argument = {
                    let values = token_match_results.get_capture_group(group_id).unwrap();
                    let lexer = Lexer::new(values);
                    let (syntax_tree, lexer) = context.parse_bp(lexer, 0);
                    assert!(lexer.eof());
                    syntax_tree
                };

                TokenArgumentParseResult {
                    argument_index: *argument_index,
                    argument,
                    lexer,
                }
            }
            TokenArgumentParser::Previous { argument_index } => {
                let argument = previous_token.take().unwrap();
                TokenArgumentParseResult {
                    argument_index: *argument_index,
                    argument,
                    lexer,
                }
            }
        }
    }
}

pub type TokenDefinitionValueParser =
    for<'input> fn(match_result: &MatchResult<'input, InputElement>) -> Vec<u8>;

fn no_value_parser<'input>(_match_result: &MatchResult<'input, InputElement>) -> Vec<u8> {
    vec![]
}

impl TokenDefinition {
    pub fn new(name: TokenIdentifier, binding_power: (Option<u32>, Option<u32>)) -> Self {
        let arguments_parser = match binding_power {
            (Some(_), Some(minimum_binding_power)) => vec![
                TokenArgumentParser::Previous {
                    argument_index: Some(0),
                },
                TokenArgumentParser::Next {
                    minimum_binding_power,
                    argument_index: Some(1),
                },
            ],
            (Some(_), None) => vec![TokenArgumentParser::Previous {
                argument_index: Some(0),
            }],
            (None, Some(minimum_binding_power)) => vec![TokenArgumentParser::Next {
                minimum_binding_power,
                argument_index: Some(0),
            }],
            (None, None) => vec![],
        };

        Self::new_with_parsers(name, binding_power, arguments_parser)
    }

    pub fn new_with_parsers(
        name: TokenIdentifier,
        binding_power: (Option<u32>, Option<u32>),
        arguments_parsers: Vec<TokenArgumentParser>,
    ) -> Self {
        let mut argument_indices: Vec<_> = arguments_parsers
            .iter()
            .filter_map(|v| match v {
                TokenArgumentParser::Next { argument_index, .. } => *argument_index,
                TokenArgumentParser::NextSymbol { argument_index, .. } => *argument_index,
                TokenArgumentParser::CapturingGroup { argument_index, .. } => *argument_index,
                TokenArgumentParser::Previous { argument_index } => *argument_index,
            })
            .collect();

        argument_indices.sort();
        assert_eq!(
            argument_indices,
            (0..argument_indices.len()).collect::<Vec<_>>()
        );

        Self {
            name,
            binding_power,
            arguments_parsers,
            argument_count: argument_indices.len(),
            is_container: false,
            value_parser: no_value_parser,
        }
    }

    pub fn with_is_container(self) -> Self {
        assert!(self.arguments_parsers.len() == 0);
        Self {
            is_container: true,
            ..self
        }
    }

    pub fn with_value_parser(self, value_parser: TokenDefinitionValueParser) -> Self {
        Self {
            value_parser,
            ..self
        }
    }

    fn binding_power_pattern(&self) -> (bool, bool) {
        (
            self.binding_power.0.is_some(),
            self.binding_power.1.is_some(),
        )
    }

    pub fn name(&self) -> String {
        (&self.name).into()
    }

    pub fn parse_arguments<'lexer, 'input>(
        &self,
        mut lexer: Lexer<'lexer>,
        context: &ParseContext,
        token_match_results: &MatchResult<'input, InputElement>,
        mut previous_token: Option<SyntaxTree>,
    ) -> (Vec<SyntaxTree>, Lexer<'lexer>) {
        if self.is_container {
            let token = match token_match_results.get_input() {
                [InputElement::Symbol(_)] => panic!("expected container token"),
                [token] => token,
                _ => panic!("expected single token"),
            };
            let token_index = {
                let lexer_end = lexer.get_range().end;
                assert!(lexer_end > 0);
                lexer_end - 1
            };

            let arguments: Vec<_> = token
                .rows()
                .iter()
                .enumerate()
                .map(|(row_index, row)| {
                    let lexer = Lexer::new(&row.values);
                    let (mut syntax_tree, lexer) = context.parse_bp(lexer, 0);
                    syntax_tree.row_index = Some(RowIndex(token_index, row_index));
                    assert!(lexer.eof());
                    syntax_tree
                })
                .collect();
            (arguments, lexer)
        } else {
            let mut arguments = std::iter::repeat_with(|| SyntaxTree::default())
                .take(self.argument_count)
                .collect::<Vec<_>>();
            for parser in &self.arguments_parsers {
                let parse_result =
                    parser.parse(lexer, context, token_match_results, &mut previous_token);

                lexer = parse_result.lexer;
                if let Some(argument_index) = parse_result.argument_index {
                    arguments[argument_index] = parse_result.argument;
                }
            }

            (arguments, lexer)
        }
    }
}
