use chumsky::Parser;
use input_tree::node::InputNode;

use crate::{
    autocomplete::{AutocompleteMatcher, AutocompleteRule},
    greedy_choice::{greedy_choice, HasLen},
    rule_collection::{BindingPowerType, RuleCollection, TokenRule},
    syntax_tree::SyntaxNode,
    BoxedTokenParser, TokenParser,
};

pub struct MathParser<'a> {
    // chumsky parser goes in here
    parser: BoxedTokenParser<'a, 'a>,
    token_rules: Vec<TokenRule<'a>>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl<'a> MathParser<'a> {
    fn new(token_rules: Vec<TokenRule<'a>>, autocomplete_rules: Vec<AutocompleteRule>) -> Self {
        //let parser = make_parser(&token_rules);
        Self {
            parser: todo!(),
            token_rules,
            autocomplete_rules,
        }
    }
}

fn make_parser<'a>(token_rules: &Vec<TokenRule<'a>>) -> impl TokenParser<'a> {
    let mut token_parsers = vec![];
    let mut operator_parsers = vec![];

    for rule in token_rules {
        match rule.binding_power_type() {
            BindingPowerType::Atom => {
                // Or .clone()?
                token_parsers.push(&rule.parser);
            }
            BindingPowerType::Prefix(strength) => {
                operator_parsers.push(chumsky::pratt::prefix(&rule.parser, strength, |rhs| {
                    SyntaxNode::new(rule.name.clone(), todo!(), todo!())
                }));
            }
            BindingPowerType::Postfix => todo!(),
            BindingPowerType::LeftInfix => todo!(),
            BindingPowerType::RightInfix => todo!(),
        }
    }

    let atom = greedy_choice(token_parsers);

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
    let expr = atom.pratt(operator);

    expr
}

pub struct ParserBuilder<'a> {
    token_rules: Vec<TokenRule<'a>>,
    autocomplete_rules: Vec<AutocompleteRule>,
}

impl<'a> ParserBuilder<'a> {
    pub fn new() -> Self {
        Self {
            token_rules: Vec::new(),
            autocomplete_rules: Vec::new(),
        }
    }

    pub fn add_rule_collection<T>(mut self) -> Self
    where
        T: RuleCollection<'a>,
    {
        self.autocomplete_rules.extend(T::get_autocomplete_rules());
        self.token_rules.extend(T::get_rules());
        self
    }

    pub fn build(self) -> MathParser<'a> {
        MathParser::new(self.token_rules, self.autocomplete_rules)
    }
}

impl<'a> AutocompleteMatcher for MathParser<'a> {
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
