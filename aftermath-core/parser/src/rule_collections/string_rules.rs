use crate::parser_extensions::just_symbol;

use crate::syntax_tree::{LeafNodeType, SyntaxNodeBuilder};
use crate::{
    autocomplete::AutocompleteRule,
    rule_collection::{RuleCollection, TokenRule},
    syntax_tree::PathIdentifier,
};
use chumsky::{prelude::*, Parser};

use input_tree::node::InputNode;

pub struct StringRules {}

impl StringRules {
    fn rule_name(name: &str) -> PathIdentifier {
        PathIdentifier::new(vec!["String".into(), name.into()])
    }
}
impl RuleCollection for StringRules {
    fn get_rules() -> Vec<TokenRule> {
        vec![TokenRule::new(
            Self::rule_name("String"),
            (None, None),
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
