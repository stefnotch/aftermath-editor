use crate::make_parser::just_operator_parser;

use crate::parse_module::*;
use crate::parse_modules::ParseModules;
use crate::{autocomplete::AutocompleteRule, syntax_tree::PathIdentifier};

use input_tree::input_nodes;

pub struct CollectionsRules {
    module_name: String,
    rules: Vec<ParseRule>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl CollectionsRules {
    pub fn new(modules: &mut ParseModules) -> Self {
        let rules = Self::get_rules(modules);
        let autocomplete_rules = Self::get_autocomplete_rules();
        Self {
            module_name: "Collections".into(),
            rules,
            autocomplete_rules,
        }
    }
    fn rule_name(name: &str) -> PathIdentifier {
        PathIdentifier::new(vec!["Collections".into(), name.into()])
    }
}

impl ParseModule for CollectionsRules {
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
impl CollectionsRules {
    fn get_rules(modules: &mut ParseModules) -> Vec<ParseRule> {
        vec![left_infix_rule(
            modules.with_rule_name(Self::rule_name("Tuple")),
            50,
            just_operator_parser(','),
        )]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![
            AutocompleteRule::new("vector", input_nodes! {(table 1 x 1 (row))}),
            AutocompleteRule::new("matrix", input_nodes! {(table 1 x 1 (row))}),
        ]
    }
}
