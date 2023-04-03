use std::collections::HashMap;

use crate::math_layout::element::MathElement;

use super::{
    lexer::Lexer,
    math_semantic::MathSemantic,
    nfa_builder::NFABuilder,
    token_matcher::{CapturingGroupId, MatchResult, NFA},
    ParseStartResult,
};

pub type BindingPowerPattern = (bool, bool);
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

    pub fn get_symbol<'input>(
        &self,
        lexer: &mut Lexer<'input>,
        symbol: &NFA,
    ) -> Option<MatchResult<'input, MathElement>> {
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

        ParseContext::new(
            None,
            vec![
                // TODO: Good whitespace handling
                /*(
                    TokenMatcher {
                        pattern: NFABuilder::match_character((' ').into()).build(),
                    },
                    TokenDefinition::new(minimal_definitions.empty.clone(), (None, None)),
                ),*/
                (
                    TokenMatcher {
                        pattern: NFABuilder::match_character(('a'..='z').into())
                            .or(NFABuilder::match_character(('A'..='Z').into()))
                            .one_or_more()
                            .build(),
                    },
                    TokenDefinition::new("Variable".into(), (None, None)).with_value_parser(|v| {
                        v.get_input()
                            .iter()
                            .map(|v| match v {
                                MathElement::Symbol(v) => v.clone(),
                                _ => panic!("expected variable"),
                            })
                            .collect::<String>()
                            .into()
                    }),
                ),
                (
                    TokenMatcher {
                        pattern: NFABuilder::match_character(('0'..='9').into())
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
                    },
                    TokenDefinition::new("Number".into(), (None, None)).with_value_parser(|v| {
                        v.get_input()
                            .iter()
                            .map(|v| match v {
                                MathElement::Symbol(v) => v.clone(),
                                _ => panic!("expected variable"),
                            })
                            .collect::<String>()
                            .into()
                    }),
                ),
                (
                    TokenMatcher {
                        // https://stackoverflow.com/questions/249791/regex-for-quoted-string-with-escaping-quotes
                        pattern: NFABuilder::match_character(('"').into())
                            .then(
                                // Skip quote
                                NFABuilder::match_character(('\0'..='!').into())
                                    .or(
                                        // Skip backslash
                                        NFABuilder::match_character(('#'..='[').into()),
                                    )
                                    .or(
                                        // Rest of ASCII characters
                                        NFABuilder::match_character((']'..='~').into()),
                                    )
                                    .or(NFABuilder::match_character('\\'.into())
                                        .then_character(('\0'..='~').into()))
                                    .zero_or_more(),
                            )
                            .then_character('"'.into())
                            .build(),
                    },
                    TokenDefinition::new("String".into(), (None, None)).with_value_parser(|v| {
                        v.get_input()
                            .iter()
                            .map(|v| match v {
                                MathElement::Symbol(v) => v.clone(),
                                _ => panic!("expected variable"),
                            })
                            .collect::<String>()
                            .into()
                    }),
                ),
                (
                    "+".into(),
                    TokenDefinition::new("Add".into(), (Some(100), Some(101))),
                ),
                (
                    "-".into(),
                    TokenDefinition::new("Subtract".into(), (Some(100), Some(101))),
                ),
                (
                    "+".into(),
                    TokenDefinition::new("Add".into(), (None, Some(400))),
                ),
                (
                    "-".into(),
                    TokenDefinition::new("Subtract".into(), (None, Some(400))),
                ),
                (
                    "*".into(),
                    TokenDefinition::new("Multiply".into(), (Some(200), Some(201))),
                ),
                (
                    "/".into(),
                    TokenDefinition::new("Divide".into(), (Some(200), Some(201))),
                ),
                (
                    ".".into(),
                    TokenDefinition::new("Ring".into(), (Some(501), Some(500))),
                ),
                (
                    "!".into(),
                    TokenDefinition::new("Factorial".into(), (Some(600), None)),
                ),
                // Amusingly, if someone defines the closing bracket as a postfix operator, it'll break the brackets
                // Brackets
                ("()".into(), TokenDefinition::new("()".into(), (None, None))),
                (
                    "(".into(),
                    TokenDefinition::new_with_parsers(
                        "()".into(),
                        (None, None),
                        vec![
                            TokenArgumentParser::Next {
                                minimum_binding_power: 0,
                                argument_index: Some(0),
                            },
                            TokenArgumentParser::NextSymbol {
                                symbol: NFABuilder::match_string(")").build(),
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

    // Does not parse
    // - sup and sub that come after a sum, because those are postfix operators
    Next {
        minimum_binding_power: u32,
        argument_index: Option<usize>,
    },
    NextSymbol {
        symbol: NFA,
        argument_index: Option<usize>,
    },
    CapturingGroup {
        group_id: CapturingGroupId,
        argument_index: Option<usize>,
    },
}

impl TokenArgumentParser {
    fn parse<'input>(
        &self,
        lexer: Lexer<'input>,
        context: &ParseContext,
        // TODO: Don't rely on ParseStartResult
        start: &ParseStartResult,
    ) -> (Option<usize>, MathSemantic, Lexer<'input>) {
        match self {
            TokenArgumentParser::Next {
                minimum_binding_power,
                argument_index,
            } => {
                let argument_lexer = lexer.begin_token();
                let (argument, argument_lexer) =
                    context.parse_bp(argument_lexer, *minimum_binding_power);
                (
                    *argument_index,
                    argument,
                    argument_lexer.end_token().unwrap(),
                )
            }
            TokenArgumentParser::NextSymbol {
                symbol,
                argument_index,
            } => {
                let mut closing_bracket = lexer.begin_token();
                if let Some(_match_result) = context.get_symbol(&mut closing_bracket, symbol) {
                    // Yay
                } else {
                    // TODO: Better error message
                    panic!("expected closing bracket");
                }
                let range = closing_bracket.get_range();
                let lexer = closing_bracket.end_token().unwrap();
                let semantic = MathSemantic {
                    name: start.definition.name(),
                    args: vec![],
                    value: vec![],
                    range,
                };
                (*argument_index, semantic, lexer)
            }
            TokenArgumentParser::CapturingGroup {
                group_id,
                argument_index,
            } => {
                let semantic = {
                    let values = start.match_result.get_capture_group(group_id).unwrap();
                    let lexer = Lexer::new(values);
                    let (math_semantic, lexer) = context.parse_bp(lexer, 0);
                    assert!(lexer.eof());
                    math_semantic
                };
                (*argument_index, semantic, lexer)
            }
        }
    }
}

pub type TokenDefinitionValueParser =
    for<'input> fn(match_result: &MatchResult<'input, MathElement>) -> Vec<u8>;

fn no_value_parser<'input>(_match_result: &MatchResult<'input, MathElement>) -> Vec<u8> {
    vec![]
}

impl TokenDefinition {
    pub fn new(name: TokenIdentifier, binding_power: (Option<u32>, Option<u32>)) -> Self {
        let arguments_parser = match binding_power {
            (Some(_), Some(minimum_binding_power)) => vec![TokenArgumentParser::Next {
                minimum_binding_power,
                argument_index: Some(0),
            }],
            (Some(_), None) => vec![],
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
            value_parser: no_value_parser,
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

    pub fn parse_arguments<'input>(
        &self,
        mut lexer: Lexer<'input>,
        context: &ParseContext,
        arg: &ParseStartResult,
    ) -> (Vec<MathSemantic>, Lexer<'input>) {
        let mut semantics = std::iter::repeat_with(|| None)
            .take(self.argument_count)
            .collect::<Vec<_>>();
        for parser in &self.arguments_parsers {
            let (argument_index, semantic, new_lexer) = parser.parse(lexer, context, arg);
            lexer = new_lexer;
            if let Some(argument_index) = argument_index {
                semantics[argument_index] = Some(semantic);
            }
        }

        (semantics.into_iter().filter_map(|v| v).collect(), lexer)
    }
}
