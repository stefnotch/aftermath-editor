use std::cmp::{self, Ordering};

use chumsky::{
    extension::v1::{Ext, ExtParser},
    extra::ParserExtra,
    input::InputRef,
    prelude::*,
};

// TODO:
// - The pratt parser can be created from parsers. However, those parsers are forced to accept the same type of context as the pratt parser. This is not ideal.

pub struct PrattParseContext {
    pub min_binding_power: u16,
}

impl Clone for PrattParseContext {
    fn clone(&self) -> Self {
        Self {
            min_binding_power: self.min_binding_power.clone(),
        }
    }
}

impl Default for PrattParseContext {
    fn default() -> Self {
        Self {
            min_binding_power: 0,
        }
    }
}

pub struct PrattParseOperators<InfixParser, PrefixParser, PostfixParser, Op, O> {
    infix_ops: Vec<InfixOp<InfixParser, Op, O>>,
    prefix_ops: Vec<PrefixOp<PrefixParser, Op, O>>,
    postfix_ops: Vec<PostfixOp<PostfixParser, Op, O>>,
}

impl<InfixParser, PrefixParser, PostfixParser, Op, O> Clone
    for PrattParseOperators<InfixParser, PrefixParser, PostfixParser, Op, O>
where
    InfixParser: Clone,
    PrefixParser: Clone,
    PostfixParser: Clone,
{
    fn clone(&self) -> Self {
        Self {
            infix_ops: self.infix_ops.clone(),
            prefix_ops: self.prefix_ops.clone(),
            postfix_ops: self.postfix_ops.clone(),
        }
    }
}

impl<InfixParser, PrefixParser, PostfixParser, Op, O>
    PrattParseOperators<InfixParser, PrefixParser, PostfixParser, Op, O>
{
    fn new(
        infix_ops: Vec<InfixOp<InfixParser, Op, O>>,
        prefix_ops: Vec<PrefixOp<PrefixParser, Op, O>>,
        postfix_ops: Vec<PostfixOp<PostfixParser, Op, O>>,
    ) -> Self {
        Self {
            infix_ops,
            prefix_ops,
            postfix_ops,
        }
    }
}

pub struct PrattParser_<I, O, E, Atom, Operators> {
    /// Atom parser, will usually be a choice parser
    atom: Atom,
    operators: Operators,
    _phantom: std::marker::PhantomData<(I, O, E)>,
}

impl<I, O, E, Atom, Operators> Clone for PrattParser_<I, O, E, Atom, Operators>
where
    Atom: Clone,
    Operators: Clone,
{
    fn clone(&self) -> Self {
        Self {
            atom: self.atom.clone(),
            operators: self.operators.clone(),
            _phantom: std::marker::PhantomData,
        }
    }
}

impl<'a, I, O, E, Atom, InfixParser, PrefixParser, PostfixParser, Op>
    PrattParser_<
        I,
        O,
        E,
        Atom,
        PrattParseOperators<InfixParser, PrefixParser, PostfixParser, Op, O>,
    >
where
    I: Input<'a>,
    E: ParserExtra<'a, I, Context = PrattParseContext>,
    Atom: Parser<'a, I, O, E>,
    InfixParser: Parser<'a, I, Op, E>,
    PrefixParser: Parser<'a, I, Op, E>,
    PostfixParser: Parser<'a, I, Op, E>,
{
    fn pratt_parse(
        &self,
        inp: &mut InputRef<'a, '_, I, E>,
        min_binding_power: Strength,
    ) -> Result<O, E::Error> {
        let pre_op = inp.save();
        // Find first matching prefix operator
        let prefix_op = self.operators.prefix_ops.iter().find_map(|op| {
            inp.rewind(pre_op);
            inp.parse(&op.parser).ok().map(|v| (v, op))
        });
        let mut left = match prefix_op {
            Some((value, op)) => {
                let right = self.pratt_parse(inp, op.precedence.strength_right());
                match right {
                    Ok(right) => (op.build)(value, Some(right)),
                    Err(_) => {
                        // We are missing an atom after the prefix operator.
                        // So it's time to do error recovery.
                        // Note:
                        // The "unknown atom" case is handled separately elsewhere. As in, we might as well report "missing atom", "unknown atom" as two separate errors, right after one another.
                        (op.build)(value, None)
                    }
                }
            }
            None => {
                inp.rewind(pre_op);
                inp.parse(&self.atom)?
                // Not finding an atom is an error, but we don't handle it here.
                // Instead, we let the calling parser choose how to handle it.
                // e.g. Prefix parsers will return a "missing atom" error.
                // e.g. Bracket parsers can be happy about not finding an atom, since it means that the bracket might be empty.
                // e.g. Row parsers can also be happy, since it means that the row might be empty.
            }
        };

        loop {
            let pre_op = inp.save();

            // Future note: Postfix and infix could be joined? (aka postfix is a special case of infix, or the other way around)
            let infix_op = self.operators.infix_ops.iter().find_map(|op| {
                inp.rewind(pre_op);
                inp.parse(&op.parser).ok().map(|v| (v, op))
            });
            match infix_op {
                Some((value, op)) => {
                    if op.precedence.strength_left() < min_binding_power {
                        inp.rewind(pre_op);
                        return Ok(left);
                    }
                    let right = self.pratt_parse(inp, op.precedence.strength_right());
                    // Same idea as prefix parsing
                    match right {
                        Ok(right) => {
                            left = (op.build)(value, (left, Some(right)));
                        }
                        Err(_) => {
                            left = (op.build)(value, (left, None));
                        }
                    }
                    continue;
                }
                None => {
                    inp.rewind(pre_op);
                }
            };

            let postfix_op = self.operators.postfix_ops.iter().find_map(|op| {
                inp.rewind(pre_op);
                inp.parse(&op.parser).ok().map(|v| (v, op))
            });
            match postfix_op {
                Some((value, op)) => {
                    if op.precedence.strength_left() < min_binding_power {
                        inp.rewind(pre_op);
                        return Ok(left);
                    }
                    left = (op.build)(value, left);
                    continue;
                }
                None => {
                    inp.rewind(pre_op);
                }
            };

            // No operator matched, so we either are
            // - at the end of the input
            // - before a closing bracket (bracket parser do pratt parsing themselves)
            // - or we have an error
            // in all of those cases, we say that we're finished and let the parent deal with it
            return Ok(left);
        }
    }
}

impl<'a, I, O, E, Atom, InfixParser, PrefixParser, PostfixParser, Op> ExtParser<'a, I, O, E>
    for PrattParser_<
        I,
        O,
        E,
        Atom,
        PrattParseOperators<InfixParser, PrefixParser, PostfixParser, Op, O>,
    >
where
    I: Input<'a>,
    E: ParserExtra<'a, I, Context = PrattParseContext>,
    Atom: Parser<'a, I, O, E>,
    InfixParser: Parser<'a, I, Op, E>,
    PrefixParser: Parser<'a, I, Op, E>,
    PostfixParser: Parser<'a, I, Op, E>,
{
    fn parse(&self, inp: &mut InputRef<'a, '_, I, E>) -> Result<O, E::Error> {
        let min_binding_power = Strength::Weak(inp.ctx().min_binding_power); // TODO: Obviously not perfect
        self.pratt_parse(inp, min_binding_power)
    }
}
pub type PrattParser<I, O, E, Atom, Operators> = Ext<PrattParser_<I, O, E, Atom, Operators>>;

pub fn pratt_parser<'a, I, O, E, Atom, InfixParser, PrefixParser, PostfixParser, Op>(
    atom: Atom,
    infix_ops: Vec<InfixOp<InfixParser, Op, O>>,
    prefix_ops: Vec<PrefixOp<PrefixParser, Op, O>>,
    postfix_ops: Vec<PostfixOp<PostfixParser, Op, O>>,
) -> PrattParser<I, O, E, Atom, PrattParseOperators<InfixParser, PrefixParser, PostfixParser, Op, O>>
where
    I: Input<'a>,
{
    Ext(PrattParser_ {
        atom,
        operators: PrattParseOperators::new(infix_ops, prefix_ops, postfix_ops),
        _phantom: std::marker::PhantomData,
    })
}

/// Blatantly copied from Chumsky
///
/*
The MIT License (MIT)

Copyright (c) 2021 Joshua Barretto

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
///
/// A representation of an infix operator to be used in combination with
/// [`Parser::pratt`](super::Parser::pratt).
pub struct InfixOp<P, Op, O> {
    precedence: Precedence,
    parser: P,
    build: InfixBuilder<Op, O>,
}

impl<P: Clone, Op, O> Clone for InfixOp<P, Op, O> {
    fn clone(&self) -> Self {
        Self {
            precedence: self.precedence,
            parser: self.parser.clone(),
            build: self.build,
        }
    }
}

impl<P, Op, O> InfixOp<P, Op, O> {
    /// Creates a left associative infix operator that is parsed with the
    /// parser `P`, and a function which is used to `build` a value `E`.
    /// The operator's precedence is determined by `strength`. The higher
    /// the value, the higher the precedence.
    pub fn new_left(parser: P, strength: u16, build: InfixBuilder<Op, O>) -> Self {
        let precedence = Precedence::new(strength, Assoc::Left);
        Self {
            precedence,
            parser,
            build,
        }
    }

    /// Creates a right associative infix operator that is parsed with the
    /// parser `P`, and a function which is used to `build` a value `E`.
    /// The operator's precedence is determined by `strength`. The higher
    /// the value, the higher the precedence.
    pub fn new_right(parser: P, strength: u16, build: InfixBuilder<Op, O>) -> Self {
        let precedence = Precedence::new(strength, Assoc::Left);
        Self {
            precedence,
            parser,
            build,
        }
    }
}

/// A representation of a prefix operator to be used in combination with
/// [`Parser::pratt`](super::Parser::pratt).
pub struct PrefixOp<Parser, Op, O> {
    precedence: Precedence,
    parser: Parser,
    build: PrefixBuilder<Op, O>,
}

impl<Parser: Clone, Op, O> Clone for PrefixOp<Parser, Op, O> {
    fn clone(&self) -> Self {
        Self {
            precedence: self.precedence,
            parser: self.parser.clone(),
            build: self.build,
        }
    }
}

impl<Parser, Op, O> PrefixOp<Parser, Op, O> {
    /// Creates a prefix operator (a right-associative unary operator)
    /// that is parsed with the parser `P`, and a function which is used
    /// to `build` a value `E`. The operator's precedence is determined
    /// by `strength`. The higher the value, the higher the precedence.
    pub fn new(parser: Parser, strength: u16, build: PrefixBuilder<Op, O>) -> Self {
        let precedence = Precedence::new(strength, Assoc::Left);
        Self {
            precedence,
            parser,
            build,
        }
    }
}

/// A representation of a postfix operator to be used in combination with
/// [`Parser::pratt`](super::Parser::pratt).
pub struct PostfixOp<Parser, Op, O> {
    precedence: Precedence,
    parser: Parser,
    build: PostfixBuilder<Op, O>,
}

impl<Parser: Clone, Op, O> Clone for PostfixOp<Parser, Op, O> {
    fn clone(&self) -> Self {
        Self {
            precedence: self.precedence,
            parser: self.parser.clone(),
            build: self.build,
        }
    }
}

impl<Parser, Op, O> PostfixOp<Parser, Op, O> {
    /// Creates a postfix operator (a left-associative unary operator)
    /// that is parsed with the parser `P`, and a function which is used
    /// to `build` a value `E`. The operator's precedence is determined
    /// by `strength`. The higher the value, the higher the precedence.
    pub fn new(parser: Parser, strength: u16, build: PostfixBuilder<Op, O>) -> Self {
        // Is this right associativity correct?
        let precedence = Precedence::new(strength, Assoc::Right);
        Self {
            precedence,
            parser,
            build,
        }
    }
}

/// Shorthand for [`InfixOp::new_left`].
///
/// Creates a left associative infix operator that is parsed with the
/// parser `P`, and a function which is used to `build` a value `O`.
/// The operator's precedence is determined by `strength`. The higher
/// the value, the higher the precedence.
pub fn left_infix<P, Op, O>(
    parser: P,
    strength: u16,
    build: InfixBuilder<Op, O>,
) -> InfixOp<P, Op, O> {
    InfixOp::new_left(parser, strength, build)
}

/// Shorthand for [`InfixOp::new_right`].
///
/// Creates a right associative infix operator that is parsed with the
/// parser `P`, and a function which is used to `build` a value `O`.
/// The operator's precedence is determined by `strength`. The higher
/// the value, the higher the precedence.
pub fn right_infix<P, Op, O>(
    parser: P,
    strength: u16,
    build: InfixBuilder<Op, O>,
) -> InfixOp<P, Op, O> {
    InfixOp::new_right(parser, strength, build)
}

/// Shorthand for [`PrefixOp::new`].
///
/// Creates a prefix operator (a right-associative unary operator)
/// that is parsed with the parser `P`, and a function which is used
/// to `build` a value `O`. The operator's precedence is determined
/// by `strength`. The higher the value, the higher the precedence.
pub fn prefix<P, Op, O>(
    parser: P,
    strength: u16,
    build: PrefixBuilder<Op, O>,
) -> PrefixOp<P, Op, O> {
    PrefixOp::new(parser, strength, build)
}

/// Shorthand for [`PostfixOp::new`].
///
/// Creates a postfix operator (a left-associative unary operator)
/// that is parsed with the parser `P`, and a function which is used
/// to `build` a value `O`. The operator's precedence is determined
/// by `strength`. The higher the value, the higher the precedence.
pub fn postfix<P, Op, O>(
    parser: P,
    strength: u16,
    build: PostfixBuilder<Op, O>,
) -> PostfixOp<P, Op, O> {
    PostfixOp::new(parser, strength, build)
}

/// Indicates which argument binds more strongly with a binary infix operator.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Assoc {
    /// The operator binds more strongly with the argument to the left.
    ///
    /// For example `a + b + c` is parsed as `(a + b) + c`.
    Left,

    /// The operator binds more strongly with the argument to the right.
    ///
    /// For example `a + b + c` is parsed as `a + (b + c)`.
    Right,
}

type InfixBuilder<Op, O> = fn(op: Op, children: (O, Option<O>)) -> O;

type PrefixBuilder<Op, O> = fn(op: Op, child: Option<O>) -> O;

type PostfixBuilder<Op, O> = fn(op: Op, child: O) -> O;

/// Indicates the binding strength of an operator to an argument.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Strength {
    /// This is the strongly associated side of the operator.
    Strong(u16),

    /// This is the weakly associated side of the operator.
    Weak(u16),
}

impl Strength {
    /// Get the binding strength, ignoring associativity.
    pub fn strength(&self) -> &u16 {
        match self {
            Self::Strong(strength) => strength,
            Self::Weak(strength) => strength,
        }
    }

    /// Compare two strengths.
    ///
    /// `None` is considered less strong than any `Some(Strength<T>)`,
    /// as it's used to indicate the lack of an operator
    /// to the left of the first expression and cannot bind.
    pub fn is_lt(&self, other: &Option<Self>) -> bool {
        match (self, other) {
            (x, Some(y)) => x < y,
            (_, None) => false,
        }
    }
}

impl PartialOrd for Strength {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        match self.strength().partial_cmp(other.strength()) {
            Some(Ordering::Equal) => match (self, other) {
                (Self::Strong(_), Self::Weak(_)) => Some(cmp::Ordering::Greater),
                (Self::Weak(_), Self::Strong(_)) => Some(cmp::Ordering::Less),
                _ => Some(cmp::Ordering::Equal),
            },
            ord => ord,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct Precedence {
    strength: u16,
    associativity: Assoc,
}

impl Precedence {
    /// Create a new precedence value.
    pub fn new(strength: u16, associativity: Assoc) -> Self {
        Self {
            strength,
            associativity,
        }
    }

    /// Get the binding power of this operator with an argument on the left.
    pub fn strength_left(&self) -> Strength {
        match self.associativity {
            Assoc::Left => Strength::Weak(self.strength),
            Assoc::Right => Strength::Strong(self.strength),
        }
    }

    /// Get the binding power of this operator with an argument on the right.
    pub fn strength_right(&self) -> Strength {
        match self.associativity {
            Assoc::Left => Strength::Strong(self.strength),
            Assoc::Right => Strength::Weak(self.strength),
        }
    }
}
