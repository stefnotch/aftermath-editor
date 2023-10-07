use crate::make_parser::just_operator_parser;

use crate::parse_module::*;
use crate::parse_modules::ParseModules;
use crate::{autocomplete::AutocompleteRule, syntax_tree::PathIdentifier};

use input_tree::input_nodes;

/// Rules for basic comparisons.
/// Chains of < <= can be treated as "domain restrictions".
pub struct ComparisonRules {
    module_name: String,
    rules: Vec<ParseRule>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl ComparisonRules {
    pub fn new(modules: &mut ParseModules) -> Self {
        let rules = Self::get_rules(modules);
        let autocomplete_rules = Self::get_autocomplete_rules();
        Self {
            module_name: "Comparison".into(),
            rules,
            autocomplete_rules,
        }
    }
    fn rule_name(name: &str) -> PathIdentifier {
        PathIdentifier::new(vec!["Comparison".into(), name.into()])
    }
}

impl ParseModule for ComparisonRules {
    fn get_module_name(&self) -> &str {
        &self.module_name
    }

    fn get_rules(&self) -> &[ParseRule] {
        &self.rules
    }

    fn get_autocomplete_rules(&self) -> &[AutocompleteRule] {
        &self.autocomplete_rules
    }
}
impl ComparisonRules {
    fn get_rules(modules: &mut ParseModules) -> Vec<ParseRule> {
        vec![
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("Equals")),
                40,
                just_operator_parser('='),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("GreaterThan")),
                50,
                just_operator_parser('>'),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("LessThan")),
                50,
                just_operator_parser('<'),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("GreaterThanOrEquals")),
                50,
                just_operator_parser('≥'),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("LessThanOrEquals")),
                50,
                just_operator_parser('≤'),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![
            AutocompleteRule::new(">=", input_nodes! {"≥"}),
            AutocompleteRule::new("<=", input_nodes! {"≤"}),
        ]
    }
}
