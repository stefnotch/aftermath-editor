use std::collections::HashMap;

use input_tree::{element::InputElement, row::RowIndex};

use crate::{
    grapheme_matcher::GraphemeMatcher,
    syntax_tree::{LeafNodeType, SyntaxLeafNode},
    token_matcher::MatchError,
    SyntaxNode,
};

use super::{
    lexer::Lexer,
    nfa_builder::NFABuilder,
    token_matcher::{MatchResult, NFA},
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
                    TokenDefinition::new("Variable".into(), (None, None)),
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
                    TokenDefinition::new("Number".into(), (None, None)),
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
                    TokenDefinition::new("String".into(), (None, None)),
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
                // TODO: The dx at the end of an integral might not even be a closing bracket.
                // After all, it can also sometimes appear inside an integral.

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
                            TokenArgumentParser::ParseNext {
                                minimum_binding_power: 0,
                                argument_index: 0,
                            },
                            TokenArgumentParser::NextSymbol {
                                symbol: NFABuilder::match_character(')'.into()).build(),
                                symbol_type: LeafNodeType::Operator,
                                argument_index: 1,
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
                            TokenArgumentParser::ParseNext {
                                minimum_binding_power: 0,
                                argument_index: 0,
                            },
                            TokenArgumentParser::NextSymbol {
                                symbol: NFABuilder::match_character(')'.into()).build(),
                                argument_index: 1,
                                symbol_type: LeafNodeType::Operator,
                            },
                        ],
                    ),
                ),
                // TODO: "Nothing" token? Or at least document its existence
            ],
        )
    }
}

/// TODO: This should be replaced with a "parser" without a context.
/// And the pub arguments_parsers: Vec<TokenArgumentParser>, should be replaced with a parser that has a state/context/whatever.
/// That argument context should have the "previous token" and "self token" (complete with a range and the capturing groups).
pub enum TokenMatcher {
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
    ParseNext {
        minimum_binding_power: u32,
        argument_index: usize,
    },
    NextSymbol {
        symbol: NFA,
        symbol_type: LeafNodeType,
        argument_index: usize,
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
    argument_index: usize,
    argument: SyntaxNode,
    lexer: Lexer<'lexer>,
}

impl TokenArgumentParser {
    fn parse<'lexer, 'input>(
        &self,
        lexer: Lexer<'lexer>,
        context: &ParseContext,
    ) -> TokenArgumentParseResult<'lexer> {
        match self {
            TokenArgumentParser::ParseNext {
                minimum_binding_power,
                argument_index,
            } => {
                let argument_lexer = lexer.begin_token();
                let (argument, argument_lexer) =
                    context.parse_bp(argument_lexer, *minimum_binding_power);
                TokenArgumentParseResult {
                    argument_index: *argument_index,
                    argument: SyntaxNode::Container(argument),
                    lexer: argument_lexer.end_token().unwrap(),
                }
            }
            TokenArgumentParser::NextSymbol {
                symbol,
                argument_index,
                symbol_type,
            } => {
                let mut lexer = lexer.begin_token();
                if let Some(_match_result) = context.get_symbol(&mut lexer, symbol) {
                    // Yay
                } else {
                    // TODO: Better error message
                    panic!("expected closing bracket");
                }
                let range = lexer.get_range();
                let symbols = lexer.get_symbols_as_string();
                let lexer = lexer.end_token().unwrap();
                let argument = SyntaxLeafNode {
                    node_type: symbol_type.clone(),
                    range,
                    symbols,
                };
                TokenArgumentParseResult {
                    argument_index: *argument_index,
                    argument: SyntaxNode::Leaf(argument),
                    lexer,
                }
            }
        }
    }
}

impl TokenDefinition {
    pub fn new(name: TokenIdentifier, binding_power: (Option<u32>, Option<u32>)) -> Self {
        let arguments_parser = match binding_power {
            // infix
            (Some(_), Some(minimum_binding_power)) => vec![TokenArgumentParser::ParseNext {
                minimum_binding_power,
                argument_index: 0,
            }],
            // prefix
            (Some(_), None) => vec![],
            // postfix
            (None, Some(minimum_binding_power)) => vec![TokenArgumentParser::ParseNext {
                minimum_binding_power,
                argument_index: 0,
            }],
            // symbol
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
            .map(|v| match v {
                TokenArgumentParser::ParseNext { argument_index, .. } => *argument_index,
                TokenArgumentParser::NextSymbol { argument_index, .. } => *argument_index,
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
        }
    }

    pub fn with_is_container(self) -> Self {
        assert!(self.arguments_parsers.len() == 0);
        Self {
            is_container: true,
            ..self
        }
    }

    fn binding_power_pattern(&self) -> (bool, bool) {
        (
            self.binding_power.0.is_some(),
            self.binding_power.1.is_some(),
        )
    }

    pub fn get_symbol_type(&self) -> LeafNodeType {
        match self.binding_power {
            (None, None) => LeafNodeType::Symbol,
            _ => LeafNodeType::Operator,
        }
    }

    pub fn name(&self) -> String {
        (&self.name).into()
    }

    pub fn parse_arguments<'lexer, 'input>(
        &self,
        mut lexer: Lexer<'lexer>,
        context: &ParseContext,
        token_match_results: &MatchResult<'input, InputElement>,
    ) -> (Vec<SyntaxNode>, Lexer<'lexer>) {
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
                    SyntaxNode::Container(syntax_tree)
                })
                .collect();
            (arguments, lexer)
        } else {
            // Fill arguments with dummies
            let mut arguments = std::iter::repeat_with(|| {
                SyntaxNode::Leaf(SyntaxLeafNode {
                    node_type: LeafNodeType::Symbol,
                    range: 0..0,
                    symbols: "".into(),
                })
            })
            .take(self.argument_count)
            .collect::<Vec<_>>();

            // And then set the argument values
            for parser in &self.arguments_parsers {
                let parse_result = parser.parse(lexer, context);

                lexer = parse_result.lexer;
                arguments[parse_result.argument_index] = parse_result.argument;
            }

            (arguments, lexer)
        }
    }
}
