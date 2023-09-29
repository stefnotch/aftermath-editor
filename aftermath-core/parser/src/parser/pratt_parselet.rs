use std::{fmt, sync::Arc};

use itertools::Itertools;

#[derive(Debug)]
pub struct PrattParselets<AtomParser, OpParser, Op, O> {
    pub(crate) parselets_starting_with_atom: Vec<PrattParselet<AtomParser, OpParser, Op, O>>,
    pub(crate) parselets_starting_with_expression: Vec<PrattParselet<AtomParser, OpParser, Op, O>>,
    pub(crate) parselets_starting_with_op: Vec<PrattParselet<AtomParser, OpParser, Op, O>>,
}

impl<AtomParser, OpParser, Op, O> Clone for PrattParselets<AtomParser, OpParser, Op, O>
where
    AtomParser: Clone,
    OpParser: Clone,
{
    fn clone(&self) -> Self {
        Self {
            parselets_starting_with_atom: self.parselets_starting_with_atom.clone(),
            parselets_starting_with_expression: self.parselets_starting_with_expression.clone(),
            parselets_starting_with_op: self.parselets_starting_with_op.clone(),
        }
    }
}

impl<AtomParser, OpParser, Op, O> PrattParselets<AtomParser, OpParser, Op, O> {
    pub fn new(parselets: Vec<PrattParselet<AtomParser, OpParser, Op, O>>) -> Self {
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

pub struct PrattParseletsBuilder<AtomParser, OpParser, Op, O> {
    parselets: Vec<PrattParselet<AtomParser, OpParser, Op, O>>,
}

impl<AtomParser, OpParser, Op, O> PrattParseletsBuilder<AtomParser, OpParser, Op, O> {
    pub fn new() -> Self {
        Self {
            parselets: Vec::new(),
        }
    }

    pub fn add_atom_parselet(mut self, parser: AtomParser) -> Self {
        self.parselets.push(PrattParselet {
            parsers: vec![PrattParseletKind::Atom(PrattAtom { parser })],
            build: Arc::new(|results: Vec<PrattParseResult<Op, O>>| {
                if let Some((PrattParseResult::Expression(v),)) =
                    results.into_iter().collect_tuple()
                {
                    v
                } else {
                    panic!("add_atom_parselet failed")
                }
            }),
        });
        self
    }

    pub fn add_prefix_parselet(
        mut self,
        binding_power: u32,
        parser: OpParser,
        build: impl Fn(Op, O) -> O + 'static,
    ) {
        self.parselets.push(PrattParselet {
            parsers: vec![
                PrattParseletKind::Op(PrattOp {
                    parser: parser,
                    // TODO: Left or right?
                    binding_power: BindingPower::new_left(binding_power),
                }),
                PrattParseletKind::Expression(PrattExpression {}),
            ],
            build: Arc::new(move |results: Vec<PrattParseResult<Op, O>>| {
                if let Some((PrattParseResult::Op(op), PrattParseResult::Expression(expr))) =
                    results.into_iter().collect_tuple()
                {
                    (build)(op, expr)
                } else {
                    panic!("add_prefix_parselet failed")
                }
            }),
        });
    }

    pub fn add_infix_parselet(
        mut self,
        binding_power: BindingPower,
        parser: OpParser,
        build: impl Fn(O, Op, O) -> O + 'static,
    ) {
        self.parselets.push(PrattParselet {
            parsers: vec![
                PrattParseletKind::Expression(PrattExpression {}),
                PrattParseletKind::Op(PrattOp {
                    parser: parser,
                    binding_power,
                }),
                PrattParseletKind::Expression(PrattExpression {}),
            ],
            build: Arc::new(move |results: Vec<PrattParseResult<Op, O>>| {
                if let Some((
                    PrattParseResult::Expression(lhs),
                    PrattParseResult::Op(op),
                    PrattParseResult::Expression(rhs),
                )) = results.into_iter().collect_tuple()
                {
                    (build)(lhs, op, rhs)
                } else {
                    panic!("add_infix_parselet failed")
                }
            }),
        });
    }

    pub fn add_postfix_parselet(
        mut self,
        binding_power: u32,
        parser: OpParser,
        build: impl Fn(O, Op) -> O + 'static,
    ) {
        self.parselets.push(PrattParselet {
            parsers: vec![
                PrattParseletKind::Expression(PrattExpression {}),
                PrattParseletKind::Op(PrattOp {
                    parser: parser,
                    // TODO: Left or right?
                    binding_power: BindingPower::new_right(binding_power),
                }),
            ],
            build: Arc::new(move |results: Vec<PrattParseResult<Op, O>>| {
                if let Some((PrattParseResult::Expression(expr), PrattParseResult::Op(op))) =
                    results.into_iter().collect_tuple()
                {
                    (build)(expr, op)
                } else {
                    panic!("add_postfix_parselet failed")
                }
            }),
        });
    }

    pub fn add_brackets_parselet(
        mut self,
        open: OpParser,
        close: OpParser,
        build: impl Fn(Op, O, Op) -> O + 'static,
    ) {
        self.parselets.push(PrattParselet {
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
            build: Arc::new(move |results: Vec<PrattParseResult<Op, O>>| {
                if let Some((
                    PrattParseResult::Op(open),
                    PrattParseResult::Expression(expr),
                    PrattParseResult::Op(close),
                )) = results.into_iter().collect_tuple()
                {
                    (build)(open, expr, close)
                } else {
                    panic!("add_brackets_parselet failed")
                }
            }),
        });
    }

    pub fn add_parselet(mut self, parselet: PrattParselet<AtomParser, OpParser, Op, O>) -> Self {
        self.parselets.push(parselet);
        self
    }

    pub fn build(self) -> PrattParselets<AtomParser, OpParser, Op, O> {
        PrattParselets::new(self.parselets)
    }
}

/// A Pratt parselet is a parser for a single operator.
/// Could be made fully type safe, but that would require a lot of hard work.
/// Also note that every parselet is *finite*. No infinite comma separated lists or anything like that.
pub struct PrattParselet<AtomParser, OpParser, Op, O> {
    pub parsers: Vec<PrattParseletKind<AtomParser, OpParser>>,
    pub build: Arc<dyn Fn(Vec<PrattParseResult<Op, O>>) -> O>,
}

impl<AtomParser, OpParser, Op, O> Clone for PrattParselet<AtomParser, OpParser, Op, O>
where
    AtomParser: Clone,
    OpParser: Clone,
{
    fn clone(&self) -> Self {
        Self {
            parsers: self.parsers.clone(),
            build: self.build.clone(),
        }
    }
}

impl<AtomParser, OpParser, Op, O> fmt::Debug for PrattParselet<AtomParser, OpParser, Op, O>
where
    AtomParser: fmt::Debug,
    OpParser: fmt::Debug,
{
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.debug_struct("PrattParselet")
            .field("parsers", &self.parsers)
            .field("build", &"...")
            .finish()
    }
}

impl<AtomParser, OpParser, Op, O> PrattParselet<AtomParser, OpParser, Op, O> {
    pub fn new(
        parsers: Vec<PrattParseletKind<AtomParser, OpParser>>,
        build: impl Fn(Vec<PrattParseResult<Op, O>>) -> O + 'static,
    ) -> Self {
        Self {
            parsers,
            build: Arc::new(build),
        }
    }
}

#[derive(Debug)]
pub enum PrattParseResult<Op, O> {
    Expression(O),
    Op(Op),
}

#[derive(Debug, Clone)]
pub enum PrattParseletKind<AtomParser, OpParser> {
    Atom(PrattAtom<AtomParser>),
    Expression(PrattExpression),
    Op(PrattOp<OpParser>),
}

#[derive(Debug, Clone)]
pub struct PrattAtom<AtomParser> {
    pub parser: AtomParser,
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
