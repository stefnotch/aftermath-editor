use crate::make_parser::{just_operator_parser, just_symbol_parser};

use crate::parse_module::*;
use crate::parse_modules::ParseModules;
use crate::{autocomplete::AutocompleteRule, syntax_tree::PathIdentifier};

use input_tree::input_nodes;

/// Rules for basic calculus.
pub struct CalculusRules {
    module_name: String,
    rules: Vec<ParseRule>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl CalculusRules {
    pub fn new(modules: &mut ParseModules) -> Self {
        let rules = Self::get_rules(modules);
        let autocomplete_rules = Self::get_autocomplete_rules();
        Self {
            module_name: "Calculus".into(),
            rules,
            autocomplete_rules,
        }
    }
    fn rule_name(name: &str) -> PathIdentifier {
        PathIdentifier::new(vec!["Calculus".into(), name.into()])
    }
}

impl ParseModule for CalculusRules {
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
impl CalculusRules {
    fn get_rules(modules: &mut ParseModules) -> Vec<ParseRule> {
        vec![
            atom_rule(
                modules.with_rule_name(Self::rule_name("Infinity")),
                just_symbol_parser("∞"),
            ),
            prefix_rule(
                modules.with_rule_name(Self::rule_name("Lim")),
                100,
                just_operator_parser(vec!['l', 'i', 'm']),
            ),
            prefix_rule(
                modules.with_rule_name(Self::rule_name("LimSup")),
                100,
                just_operator_parser(vec!['l', 'i', 'm', 's', 'u', 'p']),
            ),
            prefix_rule(
                modules.with_rule_name(Self::rule_name("LimInf")),
                100,
                just_operator_parser(vec!['l', 'i', 'm', 'i', 'n', 'f']),
            ),
            prefix_rule(
                modules.with_rule_name(Self::rule_name("Sum")),
                100,
                just_operator_parser('∑'),
            ),
            prefix_rule(
                modules.with_rule_name(Self::rule_name("Integral")),
                100,
                just_operator_parser('∫'),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![
            AutocompleteRule::new("infinity", input_nodes! {"∞"}),
            AutocompleteRule::new("lim", input_nodes! {"l", "i", "m"}),
            AutocompleteRule::new("limsup", input_nodes! {"l", "i", "m", "s", "u", "p"}),
            AutocompleteRule::new("liminf", input_nodes! {"l", "i", "m", "i", "n", "f"}),
            AutocompleteRule::new("sum", input_nodes! {"∑"}),
            AutocompleteRule::new("integral", input_nodes! {"∫"}),
            AutocompleteRule::new("integrate", input_nodes! {"∫"}),
        ]
    }
}
