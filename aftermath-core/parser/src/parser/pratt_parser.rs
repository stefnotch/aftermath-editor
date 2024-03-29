use std::rc::{Rc, Weak};

use chumsky::{
    extension::v1::{Ext, ExtParser},
    extra::ParserExtra,
    input::InputRef,
    prelude::*,
    util::MaybeRef,
};

pub struct PrattParseErrorHandler<Token, Offset, O> {
    pub make_missing_atom: Rc<dyn Fn(Offset) -> O>,
    pub make_missing_operator: Rc<dyn Fn(Offset, (O, O)) -> O>,
    pub missing_operator_binding_power: BindingPower,
    pub make_unknown_atom: Rc<dyn Fn(Offset, Token) -> O>,
}

pub struct PrattSymbolParsers<
    AtomParser,
    InfixParser,
    PrefixParser,
    PostfixParser,
    InfixBuilder,
    PrefixBuilder,
    PostfixBuilder,
    Op,
> {
    /// Atom parser, will usually be a choice parser
    atom: AtomParser,
    infix_ops: Vec<OpParser<InfixParser, InfixBuilder>>,
    prefix_ops: Vec<OpParser<PrefixParser, PrefixBuilder>>,
    postfix_ops: Vec<OpParser<PostfixParser, PostfixBuilder>>,
    phantom: std::marker::PhantomData<Op>,
}

impl<
        AtomParser,
        InfixParser,
        PrefixParser,
        PostfixParser,
        InfixBuilder,
        PrefixBuilder,
        PostfixBuilder,
        Op,
    >
    PrattSymbolParsers<
        AtomParser,
        InfixParser,
        PrefixParser,
        PostfixParser,
        InfixBuilder,
        PrefixBuilder,
        PostfixBuilder,
        Op,
    >
{
    fn new(
        atom: AtomParser,
        infix_ops: Vec<OpParser<InfixParser, InfixBuilder>>,
        prefix_ops: Vec<OpParser<PrefixParser, PrefixBuilder>>,
        postfix_ops: Vec<OpParser<PostfixParser, PostfixBuilder>>,
    ) -> Self {
        Self {
            atom,
            infix_ops,
            prefix_ops,
            postfix_ops,
            phantom: std::marker::PhantomData,
        }
    }
}

pub struct PrattParser<'a, I, O, E, Symbols, EndingParser>
where
    I: Input<'a>,
{
    symbols: Symbols,
    error_handler: PrattParseErrorHandler<MaybeRef<'a, I::Token>, I::Span, O>,
    _phantom: std::marker::PhantomData<(I, O, E, EndingParser)>,
}

pub enum RcOrWeak<T> {
    Owned(Rc<T>),
    Weak(Weak<T>),
}

impl<T> RcOrWeak<T> {
    fn inner(&self) -> Rc<T> {
        match self {
            RcOrWeak::Owned(v) => v.clone(),
            RcOrWeak::Weak(v) => v
                .upgrade()
                .expect("Recursive parser has been called before being fully defined"),
        }
    }
}

impl<T> Clone for RcOrWeak<T> {
    fn clone(&self) -> Self {
        match self {
            RcOrWeak::Owned(v) => RcOrWeak::Owned(v.clone()),
            RcOrWeak::Weak(v) => RcOrWeak::Weak(v.clone()),
        }
    }
}

pub struct PrattParserCaller_<'a, I, O, E, Symbols, EndingParser>
where
    I: Input<'a>,
{
    internal: RcOrWeak<PrattParser<'a, I, O, E, Symbols, EndingParser>>,
    min_binding_power: (u16, Strength),
    /// To check if we're at the end of the pratt parse.
    ending_parser: EndingParser,
}

impl<'a, I, O, E, Symbols, EndingParser> Clone
    for PrattParserCaller_<'a, I, O, E, Symbols, EndingParser>
where
    I: Input<'a>,
    EndingParser: Clone,
{
    fn clone(&self) -> Self {
        Self {
            internal: self.internal.clone(),
            min_binding_power: self.min_binding_power,
            ending_parser: self.ending_parser.clone(),
        }
    }
}

enum PrattParseResult<T> {
    Expression(T),
    End(T),
}

impl<T> PrattParseResult<T> {
    fn map<U>(self, f: impl FnOnce(T) -> U) -> PrattParseResult<U> {
        match self {
            PrattParseResult::Expression(v) => PrattParseResult::Expression(f(v)),
            PrattParseResult::End(v) => PrattParseResult::End(f(v)),
        }
    }
}

impl<
        'a,
        I,
        O,
        E,
        AtomParser,
        InfixParser,
        PrefixParser,
        PostfixParser,
        EndingParser,
        InfixBuilder,
        PrefixBuilder,
        PostfixBuilder,
        Op,
    >
    PrattParser<
        'a,
        I,
        O,
        E,
        PrattSymbolParsers<
            AtomParser,
            InfixParser,
            PrefixParser,
            PostfixParser,
            InfixBuilder,
            PrefixBuilder,
            PostfixBuilder,
            Op,
        >,
        EndingParser,
    >
where
    I: Input<'a>,
    E: ParserExtra<'a, I>,
    EndingParser: Parser<'a, I, (), E>,
    AtomParser: Parser<'a, I, O, E>,
    InfixParser: Parser<'a, I, Op, E>,
    PrefixParser: Parser<'a, I, Op, E>,
    PostfixParser: Parser<'a, I, Op, E>,
    InfixBuilder: self::InfixBuilder<Op, O>,
    PrefixBuilder: self::PrefixBuilder<Op, O>,
    PostfixBuilder: self::PostfixBuilder<Op, O>,
{
    pub fn new(
        atom: AtomParser,
        infix_ops: Vec<OpParser<InfixParser, InfixBuilder>>,
        prefix_ops: Vec<OpParser<PrefixParser, PrefixBuilder>>,
        postfix_ops: Vec<OpParser<PostfixParser, PostfixBuilder>>,
        error_handler: PrattParseErrorHandler<MaybeRef<'a, I::Token>, I::Span, O>,
    ) -> Self {
        Self {
            symbols: PrattSymbolParsers::new(atom, infix_ops, prefix_ops, postfix_ops),
            error_handler,
            _phantom: std::marker::PhantomData,
        }
    }

    fn is_at_end<'parse>(
        &self,
        inp: &mut InputRef<'a, 'parse, I, E>,
        ending_parser: &EndingParser,
    ) -> bool {
        if inp.is_at_end() {
            return true;
        }
        inp.can_parse(ending_parser)
    }

    fn parse_unknown<'parse>(
        &self,
        inp: &mut InputRef<'a, 'parse, I, E>,
        ending_parser: &EndingParser,
    ) -> O {
        let start_offset = inp.input_position();

        let unknown_input = inp.next_maybe().unwrap(); // TODO: Don't just unwrap here
        let mut unknown_atom = (self.error_handler.make_unknown_atom)(start_offset, unknown_input);
        loop {
            if self.is_at_end(inp, ending_parser)
                || inp.can_parse_iter(&self.symbols.prefix_ops)
                || inp.can_parse(&self.symbols.atom)
                || inp.can_parse_iter(&self.symbols.infix_ops)
                || inp.can_parse_iter(&self.symbols.postfix_ops)
            {
                break;
            }

            let atom_offset = inp.input_position();
            let op_offset = inp.input_position(); // It's a missing operator, so the offset is the same as the atom
            let unknown_input = inp.next_maybe().unwrap(); // TODO: Don't just unwrap here
            let next_unknown_atom =
                (self.error_handler.make_unknown_atom)(atom_offset, unknown_input);

            unknown_atom = (self.error_handler.make_missing_operator)(
                op_offset,
                (unknown_atom, next_unknown_atom),
            );
        }
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
    /// - AtomParser: ParseOperator(left, strength)
    /// and the fallbacks
    /// - Infix: rewind, then ParseOperator(None, strength);
    /// - Postfix: rewind, then ParseOperator(None, strength);
    /// - End: rewind, return End; (could also be moved down in this list)
    /// - Unknown: skip until End or Prefix/AtomParser/Infix/Postfix, then ParseExpression(strength) or ParseOperator(left, strength)
    /// the unknown token case is also why I even need the "End" case.
    ///
    /// ### Operator Loop
    /// - Infix: ParseExpression(strength), then ParseOperator(left, strength)
    /// - Postfix: ParseOperator(left, strength)
    /// and the fallbacks
    /// - Prefix: rewind, missing operator with strength, ParseExpression(strength), then ParseOperator(left, strength)
    /// - AtomParser: same
    /// - End: rewind, return End;
    /// - Unknown: skip until End or Prefix/AtomParser/Infix/Postfix, then ParseExpression(strength) or ParseOperator(left, strength)
    ///
    fn pratt_parse(
        &self,
        inp: &mut InputRef<'a, '_, I, E>,
        min_binding_power: (u16, Strength),
        ending_parser: &EndingParser,
    ) -> PrattParseResult<O> {
        // Iterative-ish version of the above
        let mut left = if inp.is_at_end() {
            return PrattParseResult::End((self.error_handler.make_missing_atom)(
                inp.input_position(),
            ));
        } else if let Some((value, op)) = inp.parse_iter(&self.symbols.prefix_ops) {
            let right = self
                .pratt_parse(inp, op.binding_power.strength_right(), ending_parser)
                .map(|right| op.build.build(value, right));
            match right {
                PrattParseResult::Expression(value) => value,
                PrattParseResult::End(value) => {
                    return PrattParseResult::End(value);
                }
            }
        } else if let Ok(v) = inp.parse_safe(&self.symbols.atom) {
            v
        }
        // Failure cases with graceful recovery
        else if inp.can_parse_iter(&self.symbols.infix_ops)
            || inp.can_parse_iter(&self.symbols.postfix_ops)
        {
            (self.error_handler.make_missing_atom)(inp.input_position())
        } else if self.is_at_end(inp, ending_parser) {
            // Don't try to parse more if we're at the end
            return PrattParseResult::End((self.error_handler.make_missing_atom)(
                inp.input_position(),
            ));
        } else {
            self.parse_unknown(inp, ending_parser)
        };

        loop {
            let pre_op = inp.save();

            if inp.is_at_end() {
                return PrattParseResult::End(left);
            } else if let Some((value, op)) = inp.parse_iter(&self.symbols.infix_ops) {
                if op.binding_power.strength_left() < min_binding_power {
                    inp.rewind(pre_op);
                    return PrattParseResult::Expression(left);
                }
                let right = self
                    .pratt_parse(inp, op.binding_power.strength_right(), ending_parser)
                    .map(|right| op.build.build(value, (left, right)));
                match right {
                    PrattParseResult::Expression(value) => left = value,
                    PrattParseResult::End(value) => {
                        return PrattParseResult::End(value);
                    }
                };
            } else if let Some((value, op)) = inp.parse_iter(&self.symbols.postfix_ops) {
                if op.binding_power.strength_left() < min_binding_power {
                    inp.rewind(pre_op);
                    return PrattParseResult::Expression(left);
                }
                left = op.build.build(value, left);
            }
            // Failure cases with graceful recovery
            else if inp.can_parse_iter(&self.symbols.prefix_ops)
                || inp.can_parse(&self.symbols.atom)
            {
                let start_offset = inp.input_position();
                if self
                    .error_handler
                    .missing_operator_binding_power
                    .strength_left()
                    < min_binding_power
                {
                    return PrattParseResult::Expression(left);
                }
                let right = self
                    .pratt_parse(
                        inp,
                        self.error_handler
                            .missing_operator_binding_power
                            .strength_right(),
                        ending_parser,
                    )
                    .map(|right| {
                        (self.error_handler.make_missing_operator)(start_offset, (left, right))
                    });
                match right {
                    PrattParseResult::Expression(value) => left = value,
                    PrattParseResult::End(value) => {
                        return PrattParseResult::End(value);
                    }
                };
            } else if self.is_at_end(inp, ending_parser) {
                // Don't try to parse more if we're at the end
                return PrattParseResult::End(left);
            } else {
                // Unknown
                let start_offset = inp.input_position();
                let right = self.parse_unknown(inp, ending_parser);
                left = (self.error_handler.make_missing_operator)(start_offset, (left, right));
            }
        }
    }
}

impl<
        'a,
        I,
        O,
        E,
        AtomParser,
        InfixParser,
        PrefixParser,
        PostfixParser,
        EndingParser,
        InfixBuilder,
        PrefixBuilder,
        PostfixBuilder,
        Op,
    > ExtParser<'a, I, O, E>
    for PrattParserCaller_<
        'a,
        I,
        O,
        E,
        PrattSymbolParsers<
            AtomParser,
            InfixParser,
            PrefixParser,
            PostfixParser,
            InfixBuilder,
            PrefixBuilder,
            PostfixBuilder,
            Op,
        >,
        EndingParser,
    >
where
    // TODO: Hopefully I can simplify this at some point
    I: Input<'a>,
    E: ParserExtra<'a, I>,
    EndingParser: Parser<'a, I, (), E>,
    AtomParser: Parser<'a, I, O, E>,
    InfixParser: Parser<'a, I, Op, E>,
    PrefixParser: Parser<'a, I, Op, E>,
    PostfixParser: Parser<'a, I, Op, E>,
    InfixBuilder: self::InfixBuilder<Op, O>,
    PrefixBuilder: self::PrefixBuilder<Op, O>,
    PostfixBuilder: self::PostfixBuilder<Op, O>,
{
    fn parse(&self, inp: &mut InputRef<'a, '_, I, E>) -> Result<O, E::Error> {
        // TODO: A single "(Error::MissingToken)" should become "(BuiltIn::Nothing)"

        let result =
            self.internal
                .inner()
                .pratt_parse(inp, self.min_binding_power, &self.ending_parser);
        match result {
            PrattParseResult::Expression(v) => Ok(v),
            PrattParseResult::End(v) => Ok(v),
        }
    }
}
pub type PrattParserCaller<'a, I, O, E, Symbols, EndingParser> =
    Ext<PrattParserCaller_<'a, I, O, E, Symbols, EndingParser>>;

pub fn call_pratt_parser<'a, I, O, E, Symbols, EndingParser>(
    parser_internal: RcOrWeak<PrattParser<'a, I, O, E, Symbols, EndingParser>>,
    min_binding_power: (u16, Strength),
    ending_parser: EndingParser,
) -> PrattParserCaller<'a, I, O, E, Symbols, EndingParser>
where
    I: Input<'a>,
    EndingParser: Parser<'a, I, (), E>,
    E: ParserExtra<'a, I>,
{
    Ext(PrattParserCaller_ {
        internal: parser_internal,
        min_binding_power,
        ending_parser,
    })
}

pub fn pratt_parse_recursive<'a, I, O, E, Symbols, EndingParser, F>(
    ending_parser: EndingParser,
    f: F,
) -> PrattParserCaller<'a, I, O, E, Symbols, EndingParser>
where
    F: FnOnce(
        RcOrWeak<PrattParser<'a, I, O, E, Symbols, EndingParser>>,
    ) -> PrattParser<'a, I, O, E, Symbols, EndingParser>,
    I: Input<'a>,
    EndingParser: Parser<'a, I, (), E>,
    E: ParserExtra<'a, I>,
{
    let strong_ref = Rc::new_cyclic(|weak_parser| {
        let internal = RcOrWeak::Weak(weak_parser.clone());
        f(internal)
    });

    Ext(PrattParserCaller_ {
        internal: RcOrWeak::Owned(strong_ref),
        min_binding_power: (0, Strength::Weak),
        ending_parser,
    })
}

//

pub struct OpParser<P, Build> {
    binding_power: BindingPower,
    parser: P,
    build: Build,
}

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

trait InputRefExt<'a, 'parse, I, E>
where
    I: Input<'a>,
    E: ParserExtra<'a, I>,
{
    fn input_position(&self) -> I::Span;

    fn is_at_end(&self) -> bool;
    /// Parse with the given parser, but rewind the input if it fails.
    fn parse_safe<O, P: Parser<'a, I, O, E>>(&mut self, parser: &P) -> Result<O, E::Error>;
    /// Applies all the parsers and returns the first successful result.
    fn parse_iter<'has_p, O, P: Parser<'a, I, O, E>, HasP: HasParser<P>>(
        &mut self,
        parsers: impl IntoIterator<Item = &'has_p HasP>,
    ) -> Option<(O, &'has_p HasP)>;

    /// Check if the given parser could parse the input.
    fn can_parse<O, P: Parser<'a, I, O, E>>(&mut self, parser: &P) -> bool;
    fn can_parse_iter<'has_p, O, P: Parser<'a, I, O, E>, HasP: HasParser<P> + 'has_p>(
        &mut self,
        parsers: impl IntoIterator<Item = &'has_p HasP>,
    ) -> bool;
}

impl<'a, 'parse, I, E> InputRefExt<'a, 'parse, I, E> for InputRef<'a, 'parse, I, E>
where
    I: Input<'a>,
    E: ParserExtra<'a, I>,
{
    fn input_position(&self) -> I::Span {
        self.span_since(self.offset())
    }
    fn is_at_end(&self) -> bool {
        self.peek_maybe().is_none()
    }

    fn parse_safe<O, P: Parser<'a, I, O, E>>(&mut self, parser: &P) -> Result<O, E::Error> {
        let marker = self.save();
        let result = self.parse(parser);
        match result {
            Err(e) => {
                self.rewind(marker);
                Err(e)
            }
            v => v,
        }
    }

    fn parse_iter<'has_p, O, P: Parser<'a, I, O, E>, HasP: HasParser<P>>(
        &mut self,
        parsers: impl IntoIterator<Item = &'has_p HasP>,
    ) -> Option<(O, &'has_p HasP)> {
        for p in parsers.into_iter() {
            if let Ok(result) = self.parse_safe(p.parser()) {
                return Some((result, &p));
            }
        }
        None
    }

    fn can_parse<O, P: Parser<'a, I, O, E>>(&mut self, parser: &P) -> bool {
        let marker = self.save();
        let result = self.check(parser);
        self.rewind(marker);
        result.is_ok()
    }

    fn can_parse_iter<'has_p, O, P: Parser<'a, I, O, E>, HasP: HasParser<P> + 'has_p>(
        &mut self,
        parsers: impl IntoIterator<Item = &'has_p HasP>,
    ) -> bool {
        for p in parsers.into_iter() {
            if self.can_parse(p.parser()) {
                return true;
            }
        }
        false
    }
}

trait HasParser<P> {
    fn parser(&self) -> &P;
}

impl<P, Builder> HasParser<P> for OpParser<P, Builder> {
    fn parser(&self) -> &P {
        &self.parser
    }
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

/// Creates a left associative infix operator that is parsed with the
/// parser `P`, and a function which is used to `build` a value `O`.
/// The operator's binding_power is determined by `strength`. The higher
/// the value, the higher the binding_power.
pub fn left_infix<P, Builder>(parser: P, strength: u16, build: Builder) -> OpParser<P, Builder> {
    let binding_power = BindingPower::LeftInfix(strength);
    OpParser {
        binding_power,
        parser,
        build,
    }
}

/// Creates a right associative infix operator that is parsed with the
/// parser `P`, and a function which is used to `build` a value `O`.
/// The operator's binding_power is determined by `strength`. The higher
/// the value, the higher the binding_power.
pub fn right_infix<P, Builder>(parser: P, strength: u16, build: Builder) -> OpParser<P, Builder> {
    let binding_power = BindingPower::RightInfix(strength);
    OpParser {
        binding_power,
        parser,
        build,
    }
}

/// Creates a prefix operator (a right-associative unary operator)
/// that is parsed with the parser `P`, and a function which is used
/// to `build` a value `O`. The operator's binding_power is determined
/// by `strength`. The higher the value, the higher the binding_power.
pub fn prefix<P, Builder>(parser: P, strength: u16, build: Builder) -> OpParser<P, Builder> {
    let binding_power = BindingPower::Prefix(strength);
    OpParser {
        binding_power,
        parser,
        build,
    }
}

/// Creates a postfix operator (a left-associative unary operator)
/// that is parsed with the parser `P`, and a function which is used
/// to `build` a value `O`. The operator's binding_power is determined
/// by `strength`. The higher the value, the higher the binding_power.
pub fn postfix<P, Builder>(parser: P, strength: u16, build: Builder) -> OpParser<P, Builder> {
    let binding_power = BindingPower::Postfix(strength);
    OpParser {
        binding_power,
        parser,
        build,
    }
}

pub trait InfixBuilder<Op, O> {
    fn build(&self, op: Op, children: (O, O)) -> O;
}

pub trait PrefixBuilder<Op, O> {
    fn build(&self, op: Op, right: O) -> O;
}

pub trait PostfixBuilder<Op, O> {
    fn build(&self, op: Op, left: O) -> O;
}
