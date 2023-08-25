use std::sync::Arc;

use chumsky::{cache::Cached, Parser};
use input_tree::node::InputNode;

use crate::{
    autocomplete::{AutocompleteMatcher, AutocompleteRule},
    greedy_choice::{greedy_choice, HasLen},
    rule_collection::{BindingPowerType, InputPhantom, RuleCollection, TokenRule},
    syntax_tree::SyntaxNode,
    BoxedTokenParser, TokenParser, TokenParserExtra,
};

pub struct MathParser {
    parser_cache: CachedMathParser,
    token_rules: Arc<Vec<TokenRule>>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

// chumsky parser goes in here

struct CachedMathParser {
    token_rules: Arc<Vec<TokenRule>>,
}

impl Cached for CachedMathParser {
    type Input<'src> = &'src [InputNode];

    type Output<'src> = SyntaxNode;

    type Extra<'src> = TokenParserExtra;

    fn make_parser<'src>(
        self,
    ) -> chumsky::Boxed<'src, 'src, Self::Input<'src>, Self::Output<'src>, Self::Extra<'src>> {
        let mut token_parsers = vec![];
        let mut prefix_parsers = vec![];

        for rule in self.token_rules.iter() {
            let rule_parser = (rule.make_parser)(&rule, InputPhantom::new());
            match rule.binding_power_type() {
                BindingPowerType::Atom => {
                    // Or .clone()?
                    token_parsers.push(rule_parser);
                }
                BindingPowerType::Prefix(strength) => {
                    prefix_parsers.push(chumsky::pratt::prefix(rule_parser, strength, |rhs| {
                        SyntaxNode::new(todo!(), todo!(), todo!())
                    }));
                }
                BindingPowerType::Postfix(strength) => todo!(),
                BindingPowerType::LeftInfix(strength) => todo!(),
                BindingPowerType::RightInfix(strength) => todo!(),
            }
        }

        let operator = chumsky::primitive::choice((
            chumsky::pratt::left_infix(
                chumsky::primitive::just(InputNode::Symbol("+".into())),
                1,
                |l, r| SyntaxNode::new(todo!(), todo!(), todo!()),
            ),
            chumsky::pratt::left_infix(
                chumsky::primitive::just(InputNode::Symbol("-".into())),
                1,
                |l, r| SyntaxNode::new(todo!(), todo!(), todo!()),
            ),
        ));

        let atom = greedy_choice(token_parsers);
        let prefix = chumsky::primitive::choice(prefix_parsers);

        let expr = atom.pratt(operator).with_prefix_ops(prefix);

        expr.boxed()
    }
}

impl MathParser {
    fn new(token_rules: Vec<TokenRule>, autocomplete_rules: Vec<AutocompleteRule>) -> Self {
        let token_rules = Arc::new(token_rules);
        Self {
            parser_cache: CachedMathParser {
                token_rules: token_rules.clone(),
            },
            token_rules,
            autocomplete_rules,
        }
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
}

impl AutocompleteMatcher for MathParser {
    fn matches<'input, 'b>(
        &'b self,
        input: &'input [input_tree::node::InputNode],
        min_rule_match_length: usize,
    ) -> Vec<crate::autocomplete::AutocompleteRuleMatch<'b>> {
        let mut matches = Vec::new();
        for rule in &self.autocomplete_rules {
            matches.extend(rule.matches(input, min_rule_match_length));
        }
        matches
    }
}

impl HasLen for SyntaxNode {
    fn len(&self) -> usize {
        self.range().end.abs_diff(self.range().start)
    }
}
