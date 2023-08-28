use std::sync::Arc;

use chumsky::{cache::Cached, Parser};
use input_tree::node::InputNode;

use crate::{
    autocomplete::{AutocompleteMatcher, AutocompleteRule},
    greedy_choice::greedy_choice,
    rule_collection::{BindingPowerType, InputPhantom, RuleCollection, TokenRule},
    syntax_tree::{SyntaxNode, SyntaxNodeChildren},
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

fn combine_ranges(a: std::ops::Range<usize>, b: std::ops::Range<usize>) -> std::ops::Range<usize> {
    let start = a.start.min(b.start);
    let end = a.end.max(b.end);
    start..end
}

fn build_prefix_syntax_node(op: SyntaxNode, rhs: SyntaxNode) -> SyntaxNode {
    SyntaxNode::new(
        op.name.clone(),
        combine_ranges(op.range(), rhs.range()),
        SyntaxNodeChildren::Children(vec![op, rhs]),
    )
}

fn build_postfix_syntax_node(op: SyntaxNode, lhs: SyntaxNode) -> SyntaxNode {
    SyntaxNode::new(
        op.name.clone(),
        combine_ranges(op.range(), lhs.range()),
        SyntaxNodeChildren::Children(vec![lhs, op]),
    )
}

fn build_infix_syntax_node(op: SyntaxNode, children: [SyntaxNode; 2]) -> SyntaxNode {
    let [lhs, rhs] = children;
    SyntaxNode::new(
        op.name.clone(),
        combine_ranges(op.range(), combine_ranges(lhs.range(), rhs.range())),
        SyntaxNodeChildren::Children(vec![lhs, op, rhs]),
    )
}

/// See https://github.com/zesterer/chumsky/blob/f10e56b7eac878cbad98f71fd5485a21d44db226/src/lib.rs#L3456
impl Cached for CachedMathParser {
    type Parser<'src> = BoxedTokenParser<'src, 'src>;

    fn make_parser<'src>(self) -> Self::Parser<'src> {
        let mut token_parsers = vec![];
        let mut prefix_parsers = vec![];
        let mut postfix_parsers = vec![];
        let mut infix_parsers = vec![];

        for rule in self.token_rules.iter() {
            let rule_parser = (rule.make_parser)(&rule, InputPhantom::new());
            match rule.binding_power_type() {
                BindingPowerType::Atom => {
                    // Or .clone()?
                    token_parsers.push(rule_parser);
                }
                BindingPowerType::Prefix(strength) => {
                    prefix_parsers.push(chumsky::pratt::prefix(
                        rule_parser,
                        strength,
                        build_prefix_syntax_node,
                    ));
                }
                BindingPowerType::Postfix(strength) => {
                    postfix_parsers.push(chumsky::pratt::postfix(
                        rule_parser,
                        strength,
                        build_postfix_syntax_node,
                    ));
                }
                BindingPowerType::LeftInfix(strength) => {
                    infix_parsers.push(chumsky::pratt::left_infix(
                        rule_parser,
                        strength,
                        build_infix_syntax_node,
                    ));
                }
                BindingPowerType::RightInfix(strength) => {
                    infix_parsers.push(chumsky::pratt::right_infix(
                        rule_parser,
                        strength,
                        build_infix_syntax_node,
                    ));
                }
            }
        }

        // Here's to hoping that greedy_choice doesn't devolve into exponential time
        let atom = greedy_choice(token_parsers);
        let operator = greedy_choice(infix_parsers);
        let prefix = greedy_choice(prefix_parsers);
        let postfix = greedy_choice(postfix_parsers);

        let expr = atom
            .pratt(operator)
            .with_prefix_ops(prefix)
            .with_postfix_ops(postfix);

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
