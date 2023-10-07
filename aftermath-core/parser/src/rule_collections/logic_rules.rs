use crate::make_parser::{just_operator_parser, just_symbol_parser};

use crate::parse_module::*;
use crate::parse_modules::ParseModules;
use crate::{autocomplete::AutocompleteRule, syntax_tree::PathIdentifier};

/// Rules for basic arithmetic.
pub struct LogicRules {
    module_name: String,
    rules: Vec<ParseRule>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl LogicRules {
    pub fn new(modules: &mut ParseModules) -> Self {
        let rules = Self::get_rules(modules);
        let autocomplete_rules = Self::get_autocomplete_rules();
        Self {
            module_name: "Logic".into(),
            rules,
            autocomplete_rules,
        }
    }
    fn rule_name(name: &str) -> PathIdentifier {
        PathIdentifier::new(vec!["Logic".into(), name.into()])
    }
}
impl ParseModule for LogicRules {
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
impl LogicRules {
    fn get_rules(modules: &mut ParseModules) -> Vec<ParseRule> {
        vec![
            atom_rule(
                modules.with_rule_name(Self::rule_name("True")),
                just_symbol_parser('⊤'),
            ),
            atom_rule(
                modules.with_rule_name(Self::rule_name("False")),
                just_symbol_parser('⊥'),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("And")),
                100,
                just_operator_parser('∧'),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("Or")),
                100,
                just_operator_parser('∨'),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("Not")),
                100,
                just_operator_parser('¬'),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("Equivalent")),
                100,
                just_operator_parser('⇔'),
            ),
            left_infix_rule(
                modules.with_rule_name(Self::rule_name("Implies")),
                100,
                just_operator_parser('⟹'),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
