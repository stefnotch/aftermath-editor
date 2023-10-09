use crate::make_parser::{make_brackets_parser, make_empty_brackets_parser};
use crate::parse_module::*;
use crate::parse_modules::ParseModules;

use crate::{autocomplete::AutocompleteRule, syntax_tree::PathIdentifier};

use super::built_in_rules::BuiltInRules;

pub struct FunctionRules {
    module_name: String,
    rules: Vec<ParseRule>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl FunctionRules {
    pub fn new(modules: &mut ParseModules, built_in_rules: &BuiltInRules) -> Self {
        let rules = Self::get_rules(modules, built_in_rules);
        let autocomplete_rules = Self::get_autocomplete_rules();
        Self {
            module_name: "Function".into(),
            rules,
            autocomplete_rules,
        }
    }
    fn rule_name(name: &str) -> PathIdentifier {
        PathIdentifier::new(vec!["Function".into(), name.into()])
    }
}

impl ParseModule for FunctionRules {
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
impl FunctionRules {
    fn get_rules(modules: &mut ParseModules, built_in_rules: &BuiltInRules) -> Vec<ParseRule> {
        vec![
            postfix_rule(
                modules.with_rule_name(Self::rule_name("FunctionApplication")),
                800,
                make_brackets_parser(built_in_rules.operator_rule_name, "(", ")"),
            ),
            postfix_rule(
                modules.with_rule_name(Self::rule_name("FunctionApplication")),
                800,
                make_empty_brackets_parser(built_in_rules.operator_rule_name, "(", ")"),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
