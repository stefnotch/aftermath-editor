use std::{fmt, sync::Arc};

use itertools::Itertools;

#[derive(Debug)]
pub struct PrattParselets<OpParser, Op, O, Extra> {
    pub(crate) parselets_starting_with_atom: Vec<PrattParselet<OpParser, Op, O, Extra>>,
    pub(crate) parselets_starting_with_expression: Vec<PrattParselet<OpParser, Op, O, Extra>>,
    pub(crate) parselets_starting_with_op: Vec<PrattParselet<OpParser, Op, O, Extra>>,
}

impl<OpParser, Op, O, Extra> Clone for PrattParselets<OpParser, Op, O, Extra>
where
    OpParser: Clone,
    Extra: Clone,
{
    fn clone(&self) -> Self {
        Self {
            parselets_starting_with_atom: self.parselets_starting_with_atom.clone(),
            parselets_starting_with_expression: self.parselets_starting_with_expression.clone(),
            parselets_starting_with_op: self.parselets_starting_with_op.clone(),
        }
    }
}

impl<OpParser, Op, O, Extra> PrattParselets<OpParser, Op, O, Extra> {
    pub fn new(parselets: Vec<PrattParselet<OpParser, Op, O, Extra>>) -> Self {
        let mut parselets_starting_with_atom = vec![];
        let mut parselets_starting_with_expression = vec![];
        let mut parselets_starting_with_op = vec![];

        for parselet in parselets {
            match parselet.parsers[0] {
                PrattParseletKind::Atom(_) => {
                    parselets_starting_with_atom.push(parselet);
                }
                PrattParseletKind::Expression(_) => {
                    parselets_starting_with_expression.push(parselet);
                }
                PrattParseletKind::Op(_) => {
                    parselets_starting_with_op.push(parselet);
                }
            }
        }

        Self {
            parselets_starting_with_atom,
            parselets_starting_with_expression,
            parselets_starting_with_op,
        }
    }
}

pub struct PrattParseletsBuilder<OpParser, Op, O, Extra> {
    parselets: Vec<PrattParselet<OpParser, Op, O, Extra>>,
}

impl<OpParser, Op, O, Extra> PrattParseletsBuilder<OpParser, Op, O, Extra> {
    pub fn new() -> Self {
        Self {
            parselets: Vec::new(),
        }
    }

    pub fn add_parselet(mut self, parselet: PrattParselet<OpParser, Op, O, Extra>) -> Self {
        self.parselets.push(parselet);
        self
    }

    pub fn build(self) -> PrattParselets<OpParser, Op, O, Extra> {
        PrattParselets::new(self.parselets)
    }
}

/// A Pratt parselet is a parser for a single operator.
/// Could be made fully type safe, but that would require a lot of hard work.
/// Also note that every parselet is *finite*. No infinite comma separated lists or anything like that.
pub struct PrattParselet<OpParser, Op, O, Extra> {
    pub parsers: Vec<PrattParseletKind<OpParser>>,
    pub build: Arc<dyn Fn(Vec<PrattParseResult<Op, O>>, &Extra) -> O>,
    pub extra: Extra,
}

impl<OpParser, Op, O, Extra> Clone for PrattParselet<OpParser, Op, O, Extra>
where
    OpParser: Clone,
    Extra: Clone,
{
    fn clone(&self) -> Self {
        Self {
            parsers: self.parsers.clone(),
            build: self.build.clone(),
            extra: self.extra.clone(),
        }
    }
}

impl<OpParser, Op, O, Extra> fmt::Debug for PrattParselet<OpParser, Op, O, Extra>
where
    OpParser: fmt::Debug,
    Extra: fmt::Debug,
{
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.debug_struct("PrattParselet")
            .field("parsers", &self.parsers)
            .field("build", &"...")
            .field("extra", &self.extra)
            .finish()
    }
}

impl<OpParser, Op, O, Extra> PrattParselet<OpParser, Op, O, Extra> {
    pub fn new(
        parsers: Vec<PrattParseletKind<OpParser>>,
        build: impl Fn(Vec<PrattParseResult<Op, O>>, &Extra) -> O + 'static,
        extra: Extra,
    ) -> Self {
        Self {
            parsers,
            build: Arc::new(build),
            extra,
        }
    }

    pub fn new_atom(
        parser: OpParser,
        extra: Extra,
        build: impl Fn(Op, &Extra) -> O + 'static,
    ) -> Self {
        PrattParselet {
            parsers: vec![PrattParseletKind::Atom(PrattAtom { parser })],
            build: Arc::new(|results: Vec<PrattParseResult<Op, O>>, extra| {
                if let Some((PrattParseResult::Op(v),)) = results.into_iter().collect_tuple() {
                    (build)(v, extra)
                } else {
                    panic!("new_atom failed")
                }
            }),
            extra,
        }
    }

    pub fn new_prefix(
        binding_power: u32,
        parser: OpParser,
        build: impl Fn(Op, O, &Extra) -> O + 'static,
        extra: Extra,
    ) -> Self {
        PrattParselet {
            parsers: vec![
                PrattParseletKind::Op(PrattOp {
                    parser: parser,
                    // TODO: Left or right?
                    binding_power: BindingPower::new_left(binding_power),
                }),
                PrattParseletKind::Expression(PrattExpression {}),
            ],
            build: Arc::new(move |results: Vec<PrattParseResult<Op, O>>, extra| {
                if let Some((PrattParseResult::Op(op), PrattParseResult::Expression(expr))) =
                    results.into_iter().collect_tuple()
                {
                    (build)(op, expr, extra)
                } else {
                    panic!("new_prefix failed")
                }
            }),
            extra,
        }
    }

    pub fn new_infix(
        binding_power: BindingPower,
        parser: OpParser,
        build: impl Fn(O, Op, O, &Extra) -> O + 'static,
        extra: Extra,
    ) -> Self {
        PrattParselet {
            parsers: vec![
                PrattParseletKind::Expression(PrattExpression {}),
                PrattParseletKind::Op(PrattOp {
                    parser: parser,
                    binding_power,
                }),
                PrattParseletKind::Expression(PrattExpression {}),
            ],
            build: Arc::new(move |results: Vec<PrattParseResult<Op, O>>, extra| {
                if let Some((
                    PrattParseResult::Expression(lhs),
                    PrattParseResult::Op(op),
                    PrattParseResult::Expression(rhs),
                )) = results.into_iter().collect_tuple()
                {
                    (build)(lhs, op, rhs, extra)
                } else {
                    panic!("new_infix failed")
                }
            }),
            extra,
        }
    }

    pub fn new_postfix(
        binding_power: u32,
        parser: OpParser,
        build: impl Fn(O, Op, &Extra) -> O + 'static,
        extra: Extra,
    ) -> Self {
        PrattParselet {
            parsers: vec![
                PrattParseletKind::Expression(PrattExpression {}),
                PrattParseletKind::Op(PrattOp {
                    parser: parser,
                    // TODO: Left or right?
                    binding_power: BindingPower::new_right(binding_power),
                }),
            ],
            build: Arc::new(move |results: Vec<PrattParseResult<Op, O>>, extra| {
                if let Some((PrattParseResult::Expression(expr), PrattParseResult::Op(op))) =
                    results.into_iter().collect_tuple()
                {
                    (build)(expr, op, extra)
                } else {
                    panic!("new_postfix failed")
                }
            }),
            extra,
        }
    }

    pub fn new_brackets(
        open: OpParser,
        close: OpParser,
        build: impl Fn(Op, O, Op, &Extra) -> O + 'static,
        extra: Extra,
    ) -> Self {
        PrattParselet {
            parsers: vec![
                PrattParseletKind::Op(PrattOp {
                    parser: open,
                    binding_power: BindingPower::new_left(0),
                }),
                PrattParseletKind::Expression(PrattExpression {}),
                PrattParseletKind::Op(PrattOp {
                    parser: close,
                    binding_power: BindingPower::new_right(0),
                }),
            ],
            build: Arc::new(move |results: Vec<PrattParseResult<Op, O>>, extra| {
                if let Some((
                    PrattParseResult::Op(open),
                    PrattParseResult::Expression(expr),
                    PrattParseResult::Op(close),
                )) = results.into_iter().collect_tuple()
                {
                    (build)(open, expr, close, extra)
                } else {
                    panic!("new_brackets failed")
                }
            }),
            extra,
        }
    }
}

#[derive(Debug)]
pub enum PrattParseResult<Op, O> {
    Expression(O),
    Op(Op),
}

#[derive(Debug, Clone)]
pub enum PrattParseletKind<OpParser> {
    Atom(PrattAtom<OpParser>),
    Op(PrattOp<OpParser>),
    Expression(PrattExpression),
}

#[derive(Debug, Clone)]
pub struct PrattAtom<OpParser> {
    pub parser: OpParser,
}

// TODO: "accept_empty" is not a thing. The brackets don't need this, we will turn the bracket parser into
// "(" expression ")" and a single token that needs both brackets "()"
#[derive(Debug, Clone)]
pub struct PrattExpression {}

#[derive(Debug, Clone)]
pub struct PrattOp<OpParser> {
    pub parser: OpParser,
    pub binding_power: BindingPower,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct BindingPower {
    pub binding_power: u32,
    pub associativity: Associativity,
}

impl BindingPower {
    pub fn new(binding_power: u32, associativity: Associativity) -> Self {
        Self {
            binding_power,
            associativity,
        }
    }

    pub fn new_left(binding_power: u32) -> Self {
        Self::new(binding_power, Associativity::Left)
    }

    pub fn new_right(binding_power: u32) -> Self {
        Self::new(binding_power, Associativity::Right)
    }
}

/// Indicates which argument binds more strongly with a binary infix operator.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Associativity {
    /// The operator binds more strongly with the argument to the left.
    ///
    /// For example `a + b + c` is parsed as `(a + b) + c`.
    Left,

    /// The operator binds more strongly with the argument to the right.
    ///
    /// For example `a ^ b ^ c` is parsed as `a ^ (b ^ c)`.
    Right,
}
