mod greedy_choice;
mod math_parser;
pub mod pratt_parselet;
pub mod pratt_parser_old;

use std::{collections::HashSet, sync::Arc};

use chumsky::Parser;
use input_tree::node::InputNode;

use crate::{
    autocomplete::{AutocompleteMatcher, AutocompleteRule},
    rule_collection::{RuleCollection, TokenRule},
    rule_collections::{
        arithmetic_rules::ArithmeticRules, built_in_rules::BuiltInRules,
        calculus_rules::CalculusRules, collections_rules::CollectionsRules,
        comparison_rules::ComparisonRules, core_rules::CoreRules, function_rules::FunctionRules,
        logic_rules::LogicRules, string_rules::StringRules,
    },
    syntax_tree::{NodeIdentifier, SyntaxNode},
};

use self::math_parser::CachedMathParser;

pub struct MathParser {
    parser_cache: chumsky::cache::Cache<CachedMathParser>,
    token_rules: Arc<Vec<TokenRule>>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl MathParser {
    fn new(token_rules: Vec<TokenRule>, autocomplete_rules: Vec<AutocompleteRule>) -> Self {
        let token_rules = Arc::new(token_rules);
        let parser_cache = chumsky::cache::Cache::new(CachedMathParser::new(token_rules.clone()));
        Self {
            parser_cache,
            token_rules,
            autocomplete_rules,
        }
    }

    pub fn parse<'a>(&'a self, input: &'a [InputNode]) -> SyntaxNode {
        let parser = self.parser_cache.get();
        let (result, errors) = parser.parse(input).into_output_errors();

        // Panic here, because this place is too late for error recovery.
        if errors.len() > 0 {
            panic!("Errors: {:?}", errors);
        }

        result.unwrap_or_else(|| BuiltInRules::nothing_node(0))
    }

    pub fn get_rule_names(&self) -> HashSet<NodeIdentifier> {
        self.token_rules
            .iter()
            .map(|v| v.name.clone())
            .collect::<HashSet<_>>()
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

    // Hardcoded parser rules for now
    pub fn add_default_rules(mut self) -> Self {
        self = self
            .add_rule_collection::<BuiltInRules>()
            .add_rule_collection::<CoreRules>()
            .add_rule_collection::<ArithmeticRules>()
            .add_rule_collection::<CalculusRules>()
            .add_rule_collection::<CollectionsRules>()
            .add_rule_collection::<ComparisonRules>()
            .add_rule_collection::<FunctionRules>()
            .add_rule_collection::<LogicRules>()
            .add_rule_collection::<StringRules>();
        self
    }
}

impl AutocompleteMatcher for MathParser {
    fn matches<'input, 'b>(
        &'b self,
        input: &'input [input_tree::node::InputNode],
        caret_position: usize,
        min_rule_match_length: usize,
    ) -> Vec<crate::autocomplete::AutocompleteRuleMatch<'b>> {
        let mut matches = Vec::new();
        for rule in &self.autocomplete_rules {
            matches.extend(rule.matches(input, caret_position, min_rule_match_length));
        }
        matches
    }
}
