use std::{
    cmp::{self, Ordering},
    sync::Arc,
};

use chumsky::{
    extension::v1::{Ext, ExtParser},
    extra::ParserExtra,
    input::InputRef,
    prelude::*,
};

// TODO:
// - The pratt parser can be created from parsers. However, those parsers are forced to accept the same type of context as the pratt parser. This is not ideal.
// - We're abusing the context to get better error recovery (ending parsers)

// TODO: Create helper functions for this
pub struct PrattParseContext<P> {
    pub min_binding_power: (u16, Strength),
    pub ending_parsers: ArcList<P>,
}

impl<P> PrattParseContext<P> {
    pub fn new(min_binding_power: (u16, Strength), ending_parser: P) -> Self {
        Self {
            min_binding_power,
            ending_parsers: Arc::new(ArcList_::Cons(ending_parser, Arc::new(ArcList_::Empty))),
        }
    }

    pub fn with(&self, min_binding_power: (u16, Strength), ending_parser: P) -> Self {
        Self {
            min_binding_power,
            ending_parsers: Arc::new(ArcList_::Cons(ending_parser, self.ending_parsers.clone())),
        }
    }
}

pub type ArcList<T> = Arc<ArcList_<T>>;

pub enum ArcList_<T> {
    Empty,
    Cons(T, ArcList<T>),
}

impl<T> Default for ArcList_<T> {
    fn default() -> Self {
        Self::Empty
    }
}

impl<T> ArcList_<T> {
    pub fn iter(&self) -> ArcListIter<T> {
        ArcListIter {
            list: self,
            index: 0,
        }
    }
}

pub struct ArcListIter<'a, T> {
    list: &'a ArcList_<T>,
    index: usize,
}

impl<'a, T> Iterator for ArcListIter<'a, T> {
    type Item = &'a T;

    fn next(&mut self) -> Option<Self::Item> {
        match self.list {
            ArcList_::Empty => None,
            ArcList_::Cons(v, next) => {
                self.list = next;
                self.index += 1;
                Some(v)
            }
        }
    }
}

impl<P> Clone for PrattParseContext<P> {
    fn clone(&self) -> Self {
        Self {
            min_binding_power: self.min_binding_power.clone(),
            ending_parsers: self.ending_parsers.clone(),
        }
    }
}

impl<P> Default for PrattParseContext<P> {
    fn default() -> Self {
        Self {
            min_binding_power: (0, Strength::Weak),
            ending_parsers: Default::default(),
        }
    }
}

pub struct PrattParseErrorHandler<I, Span, O> {
    pub make_missing_atom: fn(Span) -> O,
    pub make_missing_operator: fn(Span, (O, O)) -> O,
    pub missing_operator_binding_power: BindingPower,
    pub make_unknown_atom: fn(Span, I) -> O,
}

impl<I, Span, O> Clone for PrattParseErrorHandler<I, Span, O> {
    fn clone(&self) -> Self {
        Self {
            make_missing_atom: self.make_missing_atom,
            make_missing_operator: self.make_missing_operator,
            make_unknown_atom: self.make_unknown_atom,
            missing_operator_binding_power: self.missing_operator_binding_power,
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

pub struct PrattParser_<'a, I, O, E, Atom, Operators, EndParser, EndParserExtra>
where
    I: Input<'a>,
{
    /// Atom parser, will usually be a choice parser
    atom: Atom,
    operators: Operators,
    error_handler: PrattParseErrorHandler<I, I::Span, O>,
    _phantom: std::marker::PhantomData<(I, O, E, EndParser, EndParserExtra)>,
}

impl<'a, I, O, E, Atom, Operators, EndParser, EndParserExtra> Clone
    for PrattParser_<'a, I, O, E, Atom, Operators, EndParser, EndParserExtra>
where
    I: Input<'a>,
    Atom: Clone,
    Operators: Clone,
{
    fn clone(&self) -> Self {
        Self {
            atom: self.atom.clone(),
            operators: self.operators.clone(),
            error_handler: self.error_handler.clone(),
            _phantom: std::marker::PhantomData,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PrattParseResultType {
    Expression,
    End,
}

struct PrattParseResult<T> {
    variant: PrattParseResultType,
    value: T,
}

impl<
        'a,
        I,
        O,
        E,
        EndParser,
        EndParserExtra,
        Atom,
        InfixParser,
        PrefixParser,
        PostfixParser,
        Op,
    >
    PrattParser_<
        'a,
        I,
        O,
        E,
        Atom,
        PrattParseOperators<InfixParser, PrefixParser, PostfixParser, Op, O>,
        EndParser,
        EndParserExtra,
    >
where
    I: chumsky::input::SliceInput<'a, Slice = I>,
    E: ParserExtra<'a, I, Context = PrattParseContext<EndParser>>,
    EndParser: Parser<'a, I, (), EndParserExtra>,
    EndParserExtra: ParserExtra<'a, I>,
    EndParserExtra::State: Default,
    EndParserExtra::Context: Default,
    Atom: Parser<'a, I, O, E>,
    InfixParser: Parser<'a, I, Op, E>,
    PrefixParser: Parser<'a, I, Op, E>,
    PostfixParser: Parser<'a, I, Op, E>,
{
    fn try_parse_prefix<'parse>(
        &self,
        inp: &mut InputRef<'a, 'parse, I, E>,
    ) -> Option<(Op, &PrefixOp<PrefixParser, Op, O>)> {
        let marker = inp.save();
        for op in self.operators.prefix_ops.iter() {
            // Parse the child with our current pratt parsing context
            if let Some(v) = inp.parse(&op.parser).ok() {
                return Some((v, op));
            }
            inp.rewind(marker);
        }
        None
    }

    fn try_parse_atom<'parse>(&self, inp: &mut InputRef<'a, 'parse, I, E>) -> Option<O> {
        let marker = inp.save();
        match inp.parse(&self.atom).ok() {
            Some(v) => Some(v),
            None => {
                inp.rewind(marker);
                None
            }
        }
    }

    fn try_parse_infix<'parse>(
        &self,
        inp: &mut InputRef<'a, 'parse, I, E>,
    ) -> Option<(Op, &InfixOp<InfixParser, Op, O>)> {
        let marker = inp.save();
        for op in self.operators.infix_ops.iter() {
            if let Some(v) = inp.parse(&op.parser).ok() {
                return Some((v, op));
            }
            inp.rewind(marker);
        }
        None
    }

    fn try_parse_postfix<'parse>(
        &self,
        inp: &mut InputRef<'a, 'parse, I, E>,
    ) -> Option<(Op, &PostfixOp<PostfixParser, Op, O>)> {
        let marker = inp.save();
        for op in self.operators.postfix_ops.iter() {
            if let Some(v) = inp.parse(&op.parser).ok() {
                return Some((v, op));
            }
            inp.rewind(marker);
        }
        None
    }

    fn try_check_end<'parse>(
        &self,
        inp: &mut InputRef<'a, 'parse, I, E>,
        ending_parsers: &ArcList<EndParser>,
    ) -> bool {
        let offset = inp.offset();

        if inp.next_maybe().is_none() {
            return true;
        }

        for parser in ending_parsers.iter() {
            let input = inp.slice_from(offset..);
            let parse_result = parser.check(input);
            if !parse_result.has_errors() {
                return true;
            }
        }
        return false;
    }

    fn parse_unknown<'parse>(
        &self,
        inp: &mut InputRef<'a, 'parse, I, E>,
        ending_parsers: &ArcList<EndParser>,
    ) -> O {
        let start_offset = get_position(inp);

        let offset = inp.offset();
        let _v = inp.next_maybe();
        loop {
            if self.try_check_end(inp, ending_parsers) {
                break;
            }
            if let Some(_) = self.try_parse_prefix(inp) {
                break;
            }
            if let Some(_) = self.try_parse_atom(inp) {
                break;
            }
            if let Some(_) = self.try_parse_infix(inp) {
                break;
            }
            if let Some(_) = self.try_parse_postfix(inp) {
                break;
            }
            let _v = inp.next_maybe();
        }
        let unknown_input = inp.slice(offset..inp.offset());
        let unknown_atom = (&self.error_handler.make_unknown_atom)(start_offset, unknown_input);
        unknown_atom
    }

    /// Pratt parsing can either succeed, or parse nothing.
    ///
    /// At every step of the pratt parsing, we are in a given state. And we have a min strength.
    /// Then we parse a token, and go into a new state.
    ///
    /// ### Parse(strength)
    /// ParseExpression(strength), then deal with result
    /// - Expression: return Expression
    /// -
    ///
    /// ### ParseExpression(strength)
    /// We're expecting an expression. So we try out the parsers in order.
    /// - Prefix: ParseExpression(strength), then ParseOperator(left, strength)
    /// - Atom: ParseOperator(left, strength)
    /// and the fallbacks
    /// - Infix: rewind, then ParseOperator(None, strength);
    /// - Postfix: rewind, then ParseOperator(None, strength);
    /// - End: rewind, return End; (could also be moved down in this list)
    /// - Unknown: skip until End or Prefix/Atom/Infix/Postfix, then ParseExpression(strength) or ParseOperator(left, strength)
    /// the unknown token case is also why I even need the "End" case.
    ///
    /// ### Operator Loop
    /// - Infix: ParseExpression(strength), then ParseOperator(left, strength)
    /// - Postfix: ParseOperator(left, strength)
    /// and the fallbacks
    /// - Prefix: rewind, missing operator with strength, ParseExpression(strength), then ParseOperator(left, strength)
    /// - Atom: same
    /// - End: rewind, return End;
    /// - Unknown: skip until End or Prefix/Atom/Infix/Postfix, then ParseExpression(strength) or ParseOperator(left, strength)
    ///
    fn pratt_parse(
        &self,
        inp: &mut InputRef<'a, '_, I, E>,
        min_binding_power: (u16, Strength),
        ending_parsers: &ArcList<EndParser>,
    ) -> PrattParseResult<O> {
        let pre_op = inp.save();
        // Iterative-ish version of the above
        let mut left = if let Some((value, op)) = self.try_parse_prefix(inp) {
            let right = self.pratt_parse(inp, op.binding_power.strength_right(), ending_parsers);
            let value = (op.build)(value, right.value);
            if right.variant == PrattParseResultType::End {
                return PrattParseResult {
                    variant: PrattParseResultType::End,
                    value,
                };
            }
            value
        } else if let Some(v) = self.try_parse_atom(inp) {
            v
        }
        // Failure cases with graceful recovery
        else if self.try_parse_infix(inp).is_some() || self.try_parse_postfix(inp).is_some() {
            inp.rewind(pre_op);
            (&self.error_handler.make_missing_atom)(get_position(inp))
        } else if self.try_check_end(inp, ending_parsers) {
            // Don't try to parse more if we're at the end
            inp.rewind(pre_op);
            return PrattParseResult {
                variant: PrattParseResultType::End,
                value: (&self.error_handler.make_missing_atom)(get_position(inp)),
            };
        } else {
            self.parse_unknown(inp, ending_parsers)
        };

        loop {
            let pre_op = inp.save();

            if let Some((value, op)) = self.try_parse_infix(inp) {
                if op.binding_power.strength_left() < min_binding_power {
                    inp.rewind(pre_op);
                    // Or return Ok((left, op.binding_power.strength_left(), op, self.pratt_parse(op.binding_power.strength_right())))?
                    return PrattParseResult {
                        variant: PrattParseResultType::Expression,
                        value: left,
                    };
                }

                let right =
                    self.pratt_parse(inp, op.binding_power.strength_right(), ending_parsers);
                let value = (op.build)(value, (left, right.value));
                if right.variant == PrattParseResultType::End {
                    return PrattParseResult {
                        variant: PrattParseResultType::End,
                        value,
                    };
                }
                left = value;
            } else if let Some((value, op)) = self.try_parse_postfix(inp) {
                if op.binding_power.strength_left() < min_binding_power {
                    inp.rewind(pre_op);
                    return PrattParseResult {
                        variant: PrattParseResultType::Expression,
                        value: left,
                    };
                }
                left = (op.build)(value, left);
            }
            // Failure cases with graceful recovery
            else if self.try_parse_prefix(inp).is_some() || self.try_parse_atom(inp).is_some() {
                inp.rewind(pre_op);
                let start_offset = get_position(inp);
                if self
                    .error_handler
                    .missing_operator_binding_power
                    .strength_left()
                    < min_binding_power
                {
                    return PrattParseResult {
                        variant: PrattParseResultType::Expression,
                        value: left,
                    };
                }
                let right = self.pratt_parse(
                    inp,
                    self.error_handler
                        .missing_operator_binding_power
                        .strength_right(),
                    ending_parsers,
                );
                let value =
                    (self.error_handler.make_missing_operator)(start_offset, (left, right.value));
                if right.variant == PrattParseResultType::End {
                    return PrattParseResult {
                        variant: PrattParseResultType::End,
                        value,
                    };
                }
                left = value;
            } else if self.try_check_end(inp, ending_parsers) {
                // Don't try to parse more if we're at the end
                inp.rewind(pre_op);
                return PrattParseResult {
                    variant: PrattParseResultType::End,
                    value: left,
                };
            } else {
                // Unknown
                let start_offset = get_position(inp);
                let right = self.parse_unknown(inp, ending_parsers);
                left = (self.error_handler.make_missing_operator)(start_offset, (left, right));
            }
        }
    }
}

fn get_position<'a, I: Input<'a>, E: ParserExtra<'a, I>>(
    inp: &mut InputRef<'a, '_, I, E>,
) -> I::Span {
    inp.parse(empty().map_with_span(|_, span| span))
        .unwrap_or_else(|_| panic!("should never happen"))
}

impl<
        'a,
        I,
        O,
        E,
        EndParser,
        EndParserExtra,
        Atom,
        InfixParser,
        PrefixParser,
        PostfixParser,
        Op,
    > ExtParser<'a, I, O, E>
    for PrattParser_<
        'a,
        I,
        O,
        E,
        Atom,
        PrattParseOperators<InfixParser, PrefixParser, PostfixParser, Op, O>,
        EndParser,
        EndParserExtra,
    >
where
    // TODO: Hopefully I can simplify this at some point
    // Especially the "EndParser" stuff is annoying. It also requires a SliceInput.
    I: chumsky::input::SliceInput<'a, Slice = I>,
    E: ParserExtra<'a, I, Context = PrattParseContext<EndParser>>,
    EndParser: Parser<'a, I, (), EndParserExtra>,
    EndParserExtra: ParserExtra<'a, I>,
    EndParserExtra::State: Default,
    EndParserExtra::Context: Default,
    Atom: Parser<'a, I, O, E>,
    InfixParser: Parser<'a, I, Op, E>,
    PrefixParser: Parser<'a, I, Op, E>,
    PostfixParser: Parser<'a, I, Op, E>,
{
    fn parse(&self, inp: &mut InputRef<'a, '_, I, E>) -> Result<O, E::Error> {
        // TODO: A single "(Error::MissingToken)" should become "(BuiltIn::Nothing)"

        let min_binding_power = inp.ctx().min_binding_power;
        let ending_parsers = inp.ctx().ending_parsers.clone();
        Ok(self
            .pratt_parse(inp, min_binding_power, &ending_parsers)
            .value)
    }
}
pub type PrattParser<'a, I, O, E, Atom, Operators, EndParser, EndParserExtra> =
    Ext<PrattParser_<'a, I, O, E, Atom, Operators, EndParser, EndParserExtra>>;

pub fn pratt_parser<
    'a,
    I,
    O,
    E,
    EndParser,
    EndParserExtra,
    Atom,
    InfixParser,
    PrefixParser,
    PostfixParser,
    Op,
>(
    atom: Atom,
    infix_ops: Vec<InfixOp<InfixParser, Op, O>>,
    prefix_ops: Vec<PrefixOp<PrefixParser, Op, O>>,
    postfix_ops: Vec<PostfixOp<PostfixParser, Op, O>>,
    error_handler: PrattParseErrorHandler<I, I::Span, O>,
) -> PrattParser<
    'a,
    I,
    O,
    E,
    Atom,
    PrattParseOperators<InfixParser, PrefixParser, PostfixParser, Op, O>,
    EndParser,
    EndParserExtra,
>
where
    I: chumsky::input::SliceInput<'a, Slice = I>,
{
    Ext(PrattParser_ {
        atom,
        operators: PrattParseOperators::new(infix_ops, prefix_ops, postfix_ops),
        error_handler,
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
    binding_power: BindingPower,
    parser: P,
    build: InfixBuilder<Op, O>,
}

impl<P: Clone, Op, O> Clone for InfixOp<P, Op, O> {
    fn clone(&self) -> Self {
        Self {
            binding_power: self.binding_power,
            parser: self.parser.clone(),
            build: self.build,
        }
    }
}

impl<P, Op, O> InfixOp<P, Op, O> {
    /// Creates a left associative infix operator that is parsed with the
    /// parser `P`, and a function which is used to `build` a value `E`.
    /// The operator's binding_power is determined by `strength`. The higher
    /// the value, the higher the binding_power.
    pub fn new_left(parser: P, strength: u16, build: InfixBuilder<Op, O>) -> Self {
        let binding_power = BindingPower::LeftInfix(strength);
        Self {
            binding_power,
            parser,
            build,
        }
    }

    /// Creates a right associative infix operator that is parsed with the
    /// parser `P`, and a function which is used to `build` a value `E`.
    /// The operator's binding_power is determined by `strength`. The higher
    /// the value, the higher the binding_power.
    pub fn new_right(parser: P, strength: u16, build: InfixBuilder<Op, O>) -> Self {
        let binding_power = BindingPower::RightInfix(strength);
        Self {
            binding_power,
            parser,
            build,
        }
    }
}

/// A representation of a prefix operator to be used in combination with
/// [`Parser::pratt`](super::Parser::pratt).
pub struct PrefixOp<Parser, Op, O> {
    binding_power: BindingPower,
    parser: Parser,
    build: PrefixBuilder<Op, O>,
}

impl<Parser: Clone, Op, O> Clone for PrefixOp<Parser, Op, O> {
    fn clone(&self) -> Self {
        Self {
            binding_power: self.binding_power,
            parser: self.parser.clone(),
            build: self.build,
        }
    }
}

impl<Parser, Op, O> PrefixOp<Parser, Op, O> {
    /// Creates a prefix operator (a right-associative unary operator)
    /// that is parsed with the parser `P`, and a function which is used
    /// to `build` a value `E`. The operator's binding_power is determined
    /// by `strength`. The higher the value, the higher the binding_power.
    pub fn new(parser: Parser, strength: u16, build: PrefixBuilder<Op, O>) -> Self {
        let binding_power = BindingPower::Prefix(strength);
        Self {
            binding_power,
            parser,
            build,
        }
    }
}

/// A representation of a postfix operator to be used in combination with
/// [`Parser::pratt`](super::Parser::pratt).
pub struct PostfixOp<Parser, Op, O> {
    binding_power: BindingPower,
    parser: Parser,
    build: PostfixBuilder<Op, O>,
}

impl<Parser: Clone, Op, O> Clone for PostfixOp<Parser, Op, O> {
    fn clone(&self) -> Self {
        Self {
            binding_power: self.binding_power,
            parser: self.parser.clone(),
            build: self.build,
        }
    }
}

impl<Parser, Op, O> PostfixOp<Parser, Op, O> {
    /// Creates a postfix operator (a left-associative unary operator)
    /// that is parsed with the parser `P`, and a function which is used
    /// to `build` a value `E`. The operator's binding_power is determined
    /// by `strength`. The higher the value, the higher the binding_power.
    pub fn new(parser: Parser, strength: u16, build: PostfixBuilder<Op, O>) -> Self {
        let binding_power = BindingPower::Postfix(strength);
        Self {
            binding_power,
            parser,
            build,
        }
    }
}

/// Shorthand for [`InfixOp::new_left`].
///
/// Creates a left associative infix operator that is parsed with the
/// parser `P`, and a function which is used to `build` a value `O`.
/// The operator's binding_power is determined by `strength`. The higher
/// the value, the higher the binding_power.
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
/// The operator's binding_power is determined by `strength`. The higher
/// the value, the higher the binding_power.
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
/// to `build` a value `O`. The operator's binding_power is determined
/// by `strength`. The higher the value, the higher the binding_power.
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
/// to `build` a value `O`. The operator's binding_power is determined
/// by `strength`. The higher the value, the higher the binding_power.
pub fn postfix<P, Op, O>(
    parser: P,
    strength: u16,
    build: PostfixBuilder<Op, O>,
) -> PostfixOp<P, Op, O> {
    PostfixOp::new(parser, strength, build)
}

type InfixBuilder<Op, O> = fn(op: Op, children: (O, O)) -> O;

type PrefixBuilder<Op, O> = fn(op: Op, child: O) -> O;

type PostfixBuilder<Op, O> = fn(op: Op, child: O) -> O;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Ord, PartialOrd)]
pub enum Strength {
    Weak,
    Strong,
}

impl Strength {
    fn invert(self) -> Self {
        match self {
            Strength::Weak => Strength::Strong,
            Strength::Strong => Strength::Weak,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BindingPower {
    Prefix(u16),
    Postfix(u16),
    /// The operator binds more strongly with the argument to the left.
    ///
    /// For example `a + b + c` is parsed as `(a + b) + c`.
    LeftInfix(u16),
    /// The operator binds more strongly with the argument to the right.
    ///
    /// For example `a ^ b ^ c` is parsed as `a ^ (b ^ c)`.
    RightInfix(u16),
}

impl BindingPower {
    /// Note that strength is pretty much "reversed".
    /// See https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html
    fn strength_left(&self) -> (u16, Strength) {
        match self {
            // TODO: Is this correct?
            // Left associative
            BindingPower::Prefix(v) | BindingPower::LeftInfix(v) => (*v, Strength::Weak),
            // Right associative
            BindingPower::Postfix(v) | BindingPower::RightInfix(v) => (*v, Strength::Strong),
        }
    }

    fn strength_right(&self) -> (u16, Strength) {
        let (v, strength) = self.strength_left();
        (v, strength.invert())
    }
}
