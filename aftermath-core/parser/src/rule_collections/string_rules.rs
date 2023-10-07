use crate::parse_module::*;
use crate::parse_modules::ParseModules;
use crate::parser_extensions::just_symbol;

use crate::syntax_tree::{LeafNodeType, SyntaxNodeBuilder};
use crate::{autocomplete::AutocompleteRule, syntax_tree::PathIdentifier};
use chumsky::{prelude::*, Parser};

use input_tree::node::InputNode;

pub struct StringRules {
    module_name: String,
    rules: Vec<ParseRule>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl StringRules {
    pub fn new(modules: &mut ParseModules) -> Self {
        let rules = Self::get_rules(modules);
        let autocomplete_rules = Self::get_autocomplete_rules();
        Self {
            module_name: "String".into(),
            rules,
            autocomplete_rules,
        }
    }
    fn rule_name(name: &str) -> PathIdentifier {
        PathIdentifier::new(vec!["String".into(), name.into()])
    }
}
impl ParseModule for StringRules {
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
impl StringRules {
    fn get_rules(modules: &mut ParseModules) -> Vec<ParseRule> {
        vec![atom_rule(
            modules.with_rule_name(Self::rule_name("String")),
            // Based on https://stackoverflow.com/questions/249791/regex-for-quoted-string-with-escaping-quotes
            crate::make_parser::MakeParserFn(|_| {
                just_symbol("\"")
                    .then(
                        select! {
                          InputNode::Symbol(a) if a !="\"" && a !="\\" => (a, None),
                        }
                        .or(just_symbol("\\")
                            .then(select! {
                                InputNode::Symbol(a) => a,
                            })
                            .map(|(a, b)| (a, Some(b))))
                        .repeated()
                        .collect::<Vec<_>>(),
                    )
                    .then(just_symbol("\""))
                    .map(|((a, b), c)| {
                        let mut symbols = vec![a];
                        for (a, b) in b {
                            symbols.push(a);
                            if let Some(b) = b {
                                symbols.push(b);
                            }
                        }
                        symbols.push(c);
                        SyntaxNodeBuilder::new_leaf_node(symbols, LeafNodeType::Symbol)
                    })
                    .boxed()
            }),
        )]
    }

    fn get_autocomplete_rules() -> Vec<AutocompleteRule> {
        vec![]
    }
}
