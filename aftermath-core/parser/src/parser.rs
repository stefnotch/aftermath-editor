mod greedy_choice;
pub mod pratt_parser;

use std::rc::Rc;

use chumsky::Parser;
use input_tree::node::InputNode;

use crate::{
    autocomplete::{AutocompleteMatcher, AutocompleteRule},
    math_parser::CachedMathParser,
    parse_modules::ParseModuleCollection,
    rule_collections::built_in_rules::BuiltInRules,
    syntax_tree::SyntaxNode,
};

pub struct MathParser {
    parser_cache: chumsky::cache::Cache<CachedMathParser>,
    built_in: Rc<BuiltInRules>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl MathParser {
    pub fn new(parse_modules: ParseModuleCollection) -> Self {
        let autocomplete_rules = parse_modules
            .get_modules()
            .iter()
            .flat_map(|v| v.get_autocomplete_rules())
            .rev()
            .cloned()
            .collect();
        let built_in = parse_modules.get_built_in().clone();

        let parser_cache = chumsky::cache::Cache::new(CachedMathParser::new(parse_modules));
        Self {
            parser_cache,
            built_in,
            autocomplete_rules,
        }
    }

    pub fn parse<'a>(&'a self, input: &'a [InputNode]) -> SyntaxNode {
        let parser = self.parser_cache.get();
        let (result, errors) = parser.parse(input).into_output_errors();

        // Panic here, because this place is too late for error recovery.
        if !errors.is_empty() {
            panic!("Errors: {:?}", errors);
        }

        result.unwrap_or_else(|| self.built_in.nothing_node(0))
    }
}

impl AutocompleteMatcher for MathParser {
    fn matches<'b>(
        &'b self,
        input: &[input_tree::node::InputNode],
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
