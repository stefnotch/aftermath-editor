mod pratt_parser;

use std::sync::Arc;

use chumsky::{cache::Cached, Parser};
use input_tree::node::InputNode;

use crate::{
    autocomplete::{AutocompleteMatcher, AutocompleteRule},
    greedy_choice::greedy_choice,
    rule_collection::{BindingPowerType, InputPhantom, RuleCollection, TokenRule},
    syntax_tree::{SyntaxNode, SyntaxNodeChildren},
    BoxedTokenParser, TokenParser, TokenParserExtra,
};

use self::pratt_parser::CachedMathParser;

pub struct MathParser {
    parser_cache: CachedMathParser,
    token_rules: Arc<Vec<TokenRule>>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl MathParser {
    fn new(token_rules: Vec<TokenRule>, autocomplete_rules: Vec<AutocompleteRule>) -> Self {
        let token_rules = Arc::new(token_rules);
        Self {
            parser_cache: CachedMathParser {
                token_rules: token_rules.clone(),
            },
            token_rules,
            autocomplete_rules,
        }
    }
}

pub struct ParserBuilder {
    token_rules: Vec<TokenRule>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl ParserBuilder {
    pub fn new() -> Self {
        Self {
            token_rules: Vec::new(),
            autocomplete_rules: Vec::new(),
        }
    }

    pub fn add_rule_collection<T>(mut self) -> Self
    where
        T: RuleCollection,
    {
        self.autocomplete_rules.extend(T::get_autocomplete_rules());
        self.token_rules.extend(T::get_rules());
        self
    }

    pub fn build(self) -> MathParser {
        MathParser::new(self.token_rules, self.autocomplete_rules)
    }
}

impl AutocompleteMatcher for MathParser {
    fn matches<'input, 'b>(
        &'b self,
        input: &'input [input_tree::node::InputNode],
        min_rule_match_length: usize,
    ) -> Vec<crate::autocomplete::AutocompleteRuleMatch<'b>> {
        let mut matches = Vec::new();
        for rule in &self.autocomplete_rules {
            matches.extend(rule.matches(input, min_rule_match_length));
        }
        matches
    }
}
