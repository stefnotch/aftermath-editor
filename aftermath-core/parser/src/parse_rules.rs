pub mod arithmetic_rules;
pub mod built_in_rules;
pub mod calculus_rules;
pub mod collections_rules;
pub mod comparison_rules;
pub mod core_rules;
pub mod function_rules;
pub mod logic_rules;
pub mod string_rules;

use std::collections::HashMap;

use input_tree::{
    input_node::{InputNode, InputNodeContainer},
    row::Grid,
};

use crate::{
    autocomplete::{AutocompleteResult, AutocompleteRule, AutocompleteRuleMatch},
    lexer::{LexerRange, LexerToken},
    parse_row,
    syntax_tree::{LeafNodeType, NodeIdentifier, SyntaxLeafNode},
    token_matcher::MatchError,
    SyntaxNode, SyntaxNodes,
};

use self::{
    arithmetic_rules::ArithmeticRules, built_in_rules::BuiltInRules, calculus_rules::CalculusRules,
    collections_rules::CollectionRules, comparison_rules::ComparisonRules, core_rules::CoreRules,
    function_rules::FunctionRules, logic_rules::LogicRules, string_rules::StringRules,
};

use super::{
    lexer::Lexer,
    nfa_builder::NFABuilder,
    token_matcher::{MatchResult, NFA},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TokenType {
    Starting,
    Continue,
}

// TODO: Display tokens in a flattened, sorted way (for debugging)
pub struct ParserRules<'a> {
    // takes the parent context and gives it back afterwards
    parent_context: Option<&'a ParserRules<'a>>,
    known_tokens: HashMap<TokenType, Vec<TokenDefinition>>,
    autocomplete_rules: Vec<AutocompleteRule>,
    // rule_collections: Vec<&'a dyn ParseRuleCollection>,
}

/// Rules for parsing
/// - No prefix and atom token may have the same symbol.
/// - No postfix and infix token may have the same symbol.
impl<'a> ParserRules<'a> {
    pub fn new(
        parent_context: Option<&'a ParserRules<'a>>,
        tokens: Vec<TokenDefinition>,
        autocomplete_rules: Vec<AutocompleteRule>,
    ) -> Self {
        let known_tokens = tokens
            .into_iter()
            .fold(HashMap::new(), |mut acc, definition| {
                let entry = acc.entry(definition.token_type()).or_insert(vec![]);
                entry.push(definition);
                acc
            });

        Self {
            parent_context,
            known_tokens,
            autocomplete_rules,
        }
    }

    /// Greedily gets the next token. Whichever match is the longest is returned.
    /// (If the match isn't what the user intended, the user can use spaces to separate the tokens.)
    pub fn get_token<'input, 'lexer>(
        &self,
        mut lexer_range: LexerRange<'input, 'lexer>,
        token_type: TokenType,
    ) -> Option<(LexerRange<'input, 'lexer>, &TokenDefinition)> {
        let mut matches: Vec<_> = self
            .known_tokens
            .get(&token_type)?
            .iter()
            .filter_map(|definition| {
                definition
                    .starting_parser
                    .matches(lexer_range.get_next_slice())
                    .map(|v| (v, definition))
                    .ok()
            })
            .collect();

        matches = retain_max_by_key(matches, |(match_result, _)| match_result.get_length());

        if matches.len() > 0 {
            if matches.len() > 1 {
                // TODO: Better error
                panic!("multiple longest matches for token");
            } else if matches.len() == 1 {
                let (match_result, definition) = matches.into_iter().next().unwrap();
                lexer_range.consume_n(match_result.get_length());
                Some((lexer_range, definition))
            } else {
                panic!("no matches for token");
            }
        } else {
            self.parent_context
                .and_then(|v| v.get_token(lexer_range, token_type))
        }
    }

    /// Gets all autocomplete tokens that start with the given content.
    pub fn get_autocomplete(&'a self, content: &[InputNode]) -> Option<AutocompleteResult<'a>> {
        if content.len() == 0 {
            return None;
        }
        let autocomplete_partial_matches: Vec<_> = self
            .autocomplete_rules
            .iter()
            .filter_map(|rule| rule.this_starts_with_input(content).map(|v| (v, rule)))
            .collect();

        if autocomplete_partial_matches.len() > 0 {
            Some(AutocompleteResult {
                range_in_input: 0..content.len(),
                potential_rules: autocomplete_partial_matches
                    .into_iter()
                    .map(|(match_result, rule)| AutocompleteRuleMatch {
                        rule,
                        match_length: match_result.get_length(),
                    })
                    .collect(),
            })
        } else {
            None
        }
    }

    /// Find a completed autocomplete token at the start of the content.
    pub fn get_finished_autocomplete_at_beginning(
        &'a self,
        content: &[InputNode],
    ) -> Option<AutocompleteResult<'a>> {
        if content.len() == 0 {
            return None;
        }
        let mut finished_autocomplete_matches: Vec<_> = self
            .autocomplete_rules
            .iter()
            .filter_map(|rule| rule.matches(content).map(|v| (v, rule)))
            .collect();
        finished_autocomplete_matches =
            retain_max_by_key(finished_autocomplete_matches, |(match_result, _)| {
                match_result.get_length()
            });

        if finished_autocomplete_matches.len() > 0 {
            let (match_result, _) = finished_autocomplete_matches.first().unwrap();
            let match_length = match_result.get_length();
            Some(AutocompleteResult {
                range_in_input: 0..match_length,
                potential_rules: finished_autocomplete_matches
                    .into_iter()
                    .map(|(_, rule)| AutocompleteRuleMatch { rule, match_length })
                    .collect(),
            })
        } else {
            None
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

    pub fn get_token_names(&self) -> Vec<NodeIdentifier> {
        // TODO: Read this from the rules (ParseRuleCollection)
        self.known_tokens
            .values()
            .flatten()
            .map(|v| v.name.clone())
            .collect()
    }
}

impl<'a> ParserRules<'a> {
    pub fn default() -> ParserRules<'a> {
        // TODO: Add more default tokens
        // Document that \x basically means "this has a very specific meaning", such as \| always being a | symbol, and \sum always being a sum symbol.
        // Parse || abs || and their escaped \|| variants
        // 4. Parser for whitespace
        // 5. Parser for chains of < <=, which could be treated as a "domain restriction"

        let mut parse_rules = vec![];
        let mut autocomplete_rules = vec![];
        parse_rules.extend(BuiltInRules::get_rules());
        autocomplete_rules.extend(BuiltInRules::get_autocomplete_rules());
        // Bonus rules
        parse_rules.extend(CoreRules::get_rules());
        autocomplete_rules.extend(CoreRules::get_autocomplete_rules());
        parse_rules.extend(ArithmeticRules::get_rules());
        autocomplete_rules.extend(ArithmeticRules::get_autocomplete_rules());
        parse_rules.extend(CalculusRules::get_rules());
        autocomplete_rules.extend(CalculusRules::get_autocomplete_rules());
        parse_rules.extend(ComparisonRules::get_rules());
        autocomplete_rules.extend(ComparisonRules::get_autocomplete_rules());
        parse_rules.extend(CollectionRules::get_rules());
        autocomplete_rules.extend(CollectionRules::get_autocomplete_rules());
        parse_rules.extend(FunctionRules::get_rules());
        autocomplete_rules.extend(FunctionRules::get_autocomplete_rules());
        parse_rules.extend(StringRules::get_rules());
        autocomplete_rules.extend(StringRules::get_autocomplete_rules());
        parse_rules.extend(LogicRules::get_rules());
        autocomplete_rules.extend(LogicRules::get_autocomplete_rules());

        // TODO: The dx at the end of an integral might not even be a closing bracket.
        // After all, it can also sometimes appear inside an integral.
        parse_rules.push(TokenDefinition::new(
            NodeIdentifier::new(vec!["Unsorted".into(), "Factorial".into()]),
            (Some(600), None),
            StartingTokenMatcher::operator_from_character('!'),
        ));

        ParserRules::new(None, parse_rules, autocomplete_rules)
    }
}

#[derive(Debug)]
pub enum StartingTokenMatcher {
    Token(TokenMatcher),
}
impl StartingTokenMatcher {
    fn matches<'input>(
        &self,
        input: &'input [InputNode],
    ) -> Result<MatchResult<'input, InputNode>, MatchError> {
        match self {
            StartingTokenMatcher::Token(TokenMatcher { symbol, .. }) => symbol.matches(input),
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
    /// (None, None) is a constant\
    /// (None, Some) is a prefix operator\
    /// (Some, None) is a postfix operator\
    /// (Some, Some) is an infix operator
    pub binding_power: (Option<u32>, Option<u32>),
    pub starting_parser: StartingTokenMatcher,
    arguments_parser: Vec<Argument>,
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
    parser: ArgumentParserType,
}

#[derive(Debug)]
pub enum ArgumentParserType {
    Next { minimum_binding_power: u32 },
    NextToken(TokenMatcher),
}

struct TokenArgumentParseResult<'lexer> {
    argument: SyntaxNode,
    lexer: Lexer<'lexer>,
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
            } => {
                let (argument, lexer) = context.parse_bp(lexer, *minimum_binding_power);
                TokenArgumentParseResult { argument, lexer }
            }
            Argument {
                parser:
                    ArgumentParserType::NextToken(TokenMatcher {
                        symbol,
                        symbol_type,
                    }),
            } => {
                if let Some((lexer_range, _match_result)) =
                    context.get_symbol(lexer.begin_range(), symbol)
                {
                    let token = lexer_range.end_range();
                    let argument = SyntaxLeafNode::new(
                        symbol_type.clone(),
                        token.range.clone(),
                        token.get_symbols(),
                    );
                    TokenArgumentParseResult {
                        // TODO: This might sometimes be wrong, whenever an argument is actually a value
                        // ArgumentParserType::NextToken should probably have a parameter for this
                        argument: BuiltInRules::operator_node(argument),
                        lexer,
                    }
                } else {
                    let token = lexer.begin_range().end_range();
                    // TODO: Report this error properly
                    // TODO: Pass an "expected" parameter to the error
                    TokenArgumentParseResult {
                        argument: BuiltInRules::error_missing_token(token.range()),
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
            }],
            // prefix
            (None, Some(minimum_binding_power)) => vec![Argument {
                parser: ArgumentParserType::Next {
                    minimum_binding_power,
                },
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
        Self {
            name,
            binding_power,
            starting_parser,
            arguments_parser: arguments_parsers,
        }
    }

    fn token_type(&self) -> TokenType {
        match self.binding_power {
            (Some(_), Some(_)) => TokenType::Continue,
            (None, Some(_)) => TokenType::Starting,
            (Some(_), None) => TokenType::Continue,
            (None, None) => TokenType::Starting,
        }
    }

    pub fn name(&self) -> NodeIdentifier {
        (&self.name).clone()
    }

    pub fn parse_arguments<'lexer, 'input>(
        &self,
        mut lexer: Lexer<'lexer>,
        context: &ParserRules,
    ) -> (Vec<SyntaxNode>, Lexer<'lexer>) {
        let mut arguments = vec![];

        for parser in &self.arguments_parser {
            // TODO: If something expected was not found (e.g. a closing bracket), this should report the appropriate error
            // And it should not consume anything
            let parse_result = parser.parse(lexer, context);

            lexer = parse_result.lexer;
            arguments.push(parse_result.argument);
        }

        (arguments, lexer)
    }

    fn get_new_row_token_name(token: &InputNodeContainer) -> NodeIdentifier {
        match token {
            InputNodeContainer::Fraction => BuiltInRules::fraction_rule_name(),
            InputNodeContainer::Root => BuiltInRules::root_rule_name(),
            InputNodeContainer::Under => BuiltInRules::under_rule_name(),
            InputNodeContainer::Over => BuiltInRules::over_rule_name(),
            InputNodeContainer::Sup => BuiltInRules::row_rule_name(),
            InputNodeContainer::Sub => BuiltInRules::row_rule_name(),
            InputNodeContainer::Table => BuiltInRules::table_rule_name(),
        }
    }

    pub fn parse_starting_token(
        &self,
        token: LexerToken,
        parser_rules: &ParserRules,
    ) -> SyntaxNode {
        // Hardcoded for now
        match token.value {
            [input_node] => {
                match input_node {
                    InputNode::Container {
                        container_type,
                        rows,
                        offset_count: _,
                    } => {
                        let children = Grid::from_one_dimensional(
                            input_node
                                .rows()
                                .iter()
                                .map(|row| {
                                    let row_parse_result = parse_row(row, parser_rules);
                                    // TODO: Bubble up the row_parse_result.errors
                                    let syntax_tree = row_parse_result.value;
                                    syntax_tree
                                })
                                .collect(),
                            rows.width(),
                        );
                        return SyntaxNode::new(
                            Self::get_new_row_token_name(container_type),
                            // We're wrapping the new row in a token with a proper width
                            token.range(),
                            SyntaxNodes::NewRows(children),
                        );
                    }
                    InputNode::Symbol(_) => {}
                }
            }
            _ => {}
        };

        let leaf_node = SyntaxLeafNode::new(
            match &self.starting_parser {
                StartingTokenMatcher::Token(v) => v.symbol_type.clone(),
            },
            token.range(),
            token.get_symbols(),
        );

        match (self.token_type(), &leaf_node.node_type) {
            (TokenType::Starting, LeafNodeType::Symbol) => {
                SyntaxNode::new(self.name(), token.range(), SyntaxNodes::Leaf(leaf_node))
            }
            (TokenType::Starting, LeafNodeType::Operator) => BuiltInRules::operator_node(leaf_node),
            (TokenType::Continue, LeafNodeType::Symbol) => {
                panic!("symbol node in continue token")
            }
            (TokenType::Continue, LeafNodeType::Operator) => BuiltInRules::operator_node(leaf_node),
        }
    }
}

pub trait RuleCollection {
    fn get_rules() -> Vec<TokenDefinition>;
    fn get_autocomplete_rules() -> Vec<AutocompleteRule>;
    fn get_extra_rule_names() -> Vec<NodeIdentifier> {
        vec![]
    }
    fn get_rule_names() -> Vec<NodeIdentifier> {
        let mut rules_names = Self::get_rules()
            .into_iter()
            .map(|v| v.name)
            .collect::<Vec<_>>();
        rules_names.extend(Self::get_extra_rule_names());
        rules_names
    }
}

fn retain_max_by_key<T, F, B: Ord>(mut values: Vec<T>, mut get_max: F) -> Vec<T>
where
    F: FnMut(&T) -> B,
{
    if let Some(max) = values.iter().map(&mut get_max).max() {
        values.retain(|v| (get_max)(v) == max);
        values
    } else {
        vec![]
    }
}
