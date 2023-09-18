

use crate::make_parser::{just_operator_parser, just_symbol_parser};



use crate::{
    autocomplete::AutocompleteRule,
    rule_collection::{RuleCollection, TokenRule},
    syntax_tree::NodeIdentifier,
};
use chumsky::{prelude::*};




/// Rules for basic arithmetic.
pub struct LogicRules {}

impl LogicRules {
    fn rule_name(name: &str) -> NodeIdentifier {
        NodeIdentifier::new(vec!["Logic".into(), name.into()])
    }
}
impl RuleCollection for LogicRules {
    fn get_rules() -> Vec<TokenRule> {
        vec![
            TokenRule::new(
                Self::rule_name("True"),
                (None, None),
                just_symbol_parser('⊤'),
            ),
            TokenRule::new(
                Self::rule_name("False"),
                (None, None),
                just_symbol_parser('⊥'),
            ),
            TokenRule::new(
                Self::rule_name("And"),
                (Some(100), Some(101)),
                just_operator_parser('∧'),
            ),
            TokenRule::new(
                Self::rule_name("Or"),
                (Some(100), Some(101)),
                just_operator_parser('∨'),
            ),
            TokenRule::new(
                Self::rule_name("Not"),
                (Some(100), Some(101)),
                just_operator_parser('¬'),
            ),
            TokenRule::new(
                Self::rule_name("Equivalent"),
                (Some(100), Some(101)),
                just_operator_parser('⇔'),
            ),
            TokenRule::new(
                Self::rule_name("Implies"),
                (Some(100), Some(101)),
                just_operator_parser('⟹'),
            ),
        ]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
