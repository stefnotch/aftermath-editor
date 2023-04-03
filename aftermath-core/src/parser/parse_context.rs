use std::collections::HashMap;

use crate::math_layout::element::MathElement;

use super::{
    lexer::Lexer,
    math_semantic::MathSemantic,
    nfa_builder::NFABuilder,
    token_matcher::{MatchResult, NFA},
    ParseStartResult,
};

pub type BindingPowerPattern = (bool, bool);
pub struct ParseContext<'a> {
    // takes the parent context and gives it back afterwards
    parent_context: Option<&'a ParseContext<'a>>,
    known_tokens: HashMap<BindingPowerPattern, Vec<(TokenMatcher, TokenDefinition)>>,
    known_brackets: Vec<(BracketOpeningMatcher, BracketDefinition)>,
}

impl<'a> ParseContext<'a> {
    pub fn new(
        parent_context: Option<&'a ParseContext<'a>>,
        tokens: Vec<(TokenMatcher, TokenDefinition)>,
        brackets: Vec<(BracketOpeningMatcher, BracketDefinition)>,
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
            known_brackets: brackets,
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

    pub fn get_opening_bracket<'input>(
        &self,
        bracket: &mut Lexer<'input>,
    ) -> Option<(&BracketDefinition, MatchResult<'input, MathElement>)> {
        let matches: Vec<_> = self
            .known_brackets
            .iter()
            .map(|(matcher, definition)| (matcher.pattern.matches(bracket.get_slice()), definition))
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
                .and_then(|v| v.get_opening_bracket(bracket))
        }
    }

    pub fn get_closing_bracket<'input, 'definition>(
        &self,
        bracket: &mut Lexer<'input>,
        definition: &'definition BracketDefinition,
    ) -> Option<(
        &'definition BracketDefinition,
        MatchResult<'input, MathElement>,
    )> {
        let match_result = definition
            .closing_pattern
            .matches(bracket.get_slice())
            .ok()?;
        bracket.consume_n(match_result.get_length());
        Some((definition, match_result))
    }
}

impl<'a> ParseContext<'a> {
    pub fn default() -> ParseContext<'a> {
        // TODO: Add more default tokens
        // 2. Parser for various types of tokens (numbers, strings, etc.)
        // 3. Parser for functions
        // 4. Parser for whitespace
        // 5. Parser for quotes (brackets or entire tokens?)

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
                    TokenDefinition::new_with_parsers(
                        "Variable".into(),
                        (None, None),
                        no_arguments_parser,
                        |v| {
                            v.get_input()
                                .iter()
                                .map(|v| match v {
                                    MathElement::Symbol(v) => v.clone(),
                                    _ => panic!("expected variable"),
                                })
                                .collect::<String>()
                                .into()
                        },
                    ),
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
                    TokenDefinition::new_with_parsers(
                        "Number".into(),
                        (None, None),
                        no_arguments_parser,
                        |v| {
                            v.get_input()
                                .iter()
                                .map(|v| match v {
                                    MathElement::Symbol(v) => v.clone(),
                                    _ => panic!("expected variable"),
                                })
                                .collect::<String>()
                                .into()
                        },
                    ),
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
                // Unit brackets
                ("()".into(), TokenDefinition::new("()".into(), (None, None))),
            ],
            vec![(
                "(".into(),
                BracketDefinition::new("()".into(), NFABuilder::match_string(")").build()),
            )],
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

#[derive(Debug, Clone)]
pub struct TokenDefinition {
    pub name: TokenIdentifier,
    /// a constant has no binding power
    /// a prefix operator has a binding power on the right
    /// a postfix operator has a binding power on the left
    /// an infix operator has a binding power on the left and on the right
    pub binding_power: (Option<u32>, Option<u32>),

    pub arguments_parser: TokenDefinitionArgumentParser,
    pub value_parser: TokenDefinitionValueParser,
}

pub type TokenDefinitionArgumentParser =
    for<'a> fn(Lexer<'a>, &ParseContext, &ParseStartResult) -> (Vec<MathSemantic>, Lexer<'a>);

pub type TokenDefinitionValueParser =
    for<'input> fn(match_result: &MatchResult<'input, MathElement>) -> Vec<u8>;

// TODO: Maybe this is a useless design?
fn no_arguments_parser<'a>(
    lexer: Lexer<'a>,
    _: &ParseContext,
    _: &ParseStartResult,
) -> (Vec<MathSemantic>, Lexer<'a>) {
    (vec![], lexer)
}

fn prefix_arguments_parser<'a>(
    lexer: Lexer<'a>,
    context: &ParseContext,
    start: &ParseStartResult,
) -> (Vec<MathSemantic>, Lexer<'a>) {
    let argument_lexer = lexer.begin_token();
    let (argument, argument_lexer) = context.parse_bp(
        argument_lexer,
        match start {
            ParseStartResult::Token { minimum_bp, .. } => *minimum_bp,
            ParseStartResult::Bracket { .. } => todo!(),
        },
    );
    (vec![argument], argument_lexer.end_token().unwrap())
}

fn bracket_arguments_parser<'a>(
    lexer: Lexer<'a>,
    context: &ParseContext,
    start: &ParseStartResult,
) -> (Vec<MathSemantic>, Lexer<'a>) {
    let argument_lexer = lexer.begin_token();
    let (argument, argument_lexer) = context.parse_bp(
        argument_lexer,
        match start {
            ParseStartResult::Token { .. } => todo!(),
            ParseStartResult::Bracket { .. } => 0,
        },
    );
    let lexer = argument_lexer.end_token().unwrap();
    let bracket_definition = match start {
        &ParseStartResult::Token { .. } => todo!(),
        &ParseStartResult::Bracket { definition, .. } => definition,
    };

    let mut closing_bracket = lexer.begin_token();
    if let Some((_, _)) = context.get_closing_bracket(&mut closing_bracket, bracket_definition) {
        // Yay
    } else {
        // TODO: Better error message
        panic!("expected closing bracket");
    }
    let lexer = closing_bracket.end_token().unwrap();
    (vec![argument], lexer)
}

fn no_value_parser<'input>(_match_result: &MatchResult<'input, MathElement>) -> Vec<u8> {
    vec![]
}

impl TokenDefinition {
    pub fn new(name: TokenIdentifier, binding_power: (Option<u32>, Option<u32>)) -> Self {
        let arguments_parser = match binding_power {
            (Some(_), Some(_)) => no_arguments_parser,
            (Some(_), None) => no_arguments_parser,
            (None, Some(_)) => prefix_arguments_parser,
            (None, None) => no_arguments_parser,
        };

        Self::new_with_parsers(name, binding_power, arguments_parser, no_value_parser)
    }

    pub fn new_with_parsers(
        name: TokenIdentifier,
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

    pub fn name(&self) -> String {
        (&self.name).into()
    }
}

pub struct BracketOpeningMatcher {
    pattern: NFA,
}

impl From<&str> for BracketOpeningMatcher {
    fn from(pattern: &str) -> Self {
        Self {
            pattern: NFABuilder::match_string(pattern).build(),
        }
    }
}

#[derive(Debug)]
pub struct BracketDefinition {
    pub name: TokenIdentifier,
    pub arguments_parser: TokenDefinitionArgumentParser,
    pub closing_pattern: NFA,
}

impl BracketDefinition {
    pub fn new(name: TokenIdentifier, closing_pattern: NFA) -> BracketDefinition {
        BracketDefinition {
            name,
            arguments_parser: bracket_arguments_parser,
            closing_pattern,
        }
    }
    pub fn name(&self) -> String {
        (&self.name).into()
    }
}
