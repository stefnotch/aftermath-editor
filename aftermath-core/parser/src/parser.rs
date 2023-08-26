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

struct InputP<'a> {
    phantom_data: std::marker::PhantomData<&'a ()>,
}

impl<'a> Default for InputP<'a> {
    fn default() -> Self {
        Self {
            phantom_data: Default::default(),
        }
    }
}

trait LateParser {
    type P<'a>: Parser<'a, &'a str, &'a str, chumsky::extra::Default>
    where
        Self: 'a;

    fn make_parser<'a, 'b: 'a>(&'b self, input: InputP<'a>) -> Self::P<'a>;
}

struct LateJust {
    value: String,
}

impl LateParser for LateJust {
    type P<'a> = chumsky::primitive::Just<&'a str, &'a str, chumsky::extra::Default>;

    fn make_parser<'a, 'b: 'a>(&'b self, _input: InputP<'a>) -> Self::P<'a> {
        chumsky::primitive::just(self.value.as_str())
    }
}

fn testing() {
    let late_just = LateJust { value: "a".into() };

    {
        let parser = late_just.make_parser(InputP::default());
        parser.parse("a");
    }
}

/*
trait InputOrRef {
    type Input;
    type Ref<'a>;
}

trait OutputOrRef {
    type Output;
    type Ref<'a>;
}

impl InputOrRef for String {
    type Input = String;
    type Ref<'a> = &'a str;
}

impl OutputOrRef for String {
    type Output = String;
    type Ref<'a> = &'a str;
}

struct MakeParser<P, I, O>
where
    P: for<'a> Fn(InputP<'a>) -> Parser<'a, I, O, chumsky::extra::Default>,
    I: InputOrRef,
    O: OutputOrRef,
{
    pub make: fn() -> P,
    i_type: std::marker::PhantomData<I>,
    o_type: std::marker::PhantomData<O>,
}

fn cjust(
    s: String,
) -> MakeParser<chumsky::primitive::Just<&'a str, &'a str, chumsky::extra::Default>, String, String>
{
    MakeParser {
        make: || chumsky::primitive::just("a".as_str()),
        i_type: Default::default(),
        o_type: Default::default(),
    }
}
*/
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

        /*   let operator = greedy_choice(vec![
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
        ]);*/

        let operator = chumsky::pratt::left_infix(
            chumsky::primitive::choice(vec![
                chumsky::primitive::just(InputNode::Symbol("+".into())),
                chumsky::primitive::just(InputNode::Symbol("-".into())),
            ]),
            1,
            |l, r| SyntaxNode::new(todo!(), todo!(), todo!()),
        );

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
