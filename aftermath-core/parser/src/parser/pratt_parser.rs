use chumsky::{
    extension::v1::{Ext, ExtParser},
    extra::ParserExtra,
    input::InputRef,
    prelude::*,
};

use crate::parser::pratt_parselet::PrattParseletKind;

use super::pratt_parselet::{
    Associativity, BindingPower, PrattParseResult, PrattParselet, PrattParselets,
};

#[derive(Debug)]
pub struct PrattParseErrorHandler<I, Span, O, Op> {
    pub make_missing_atom: fn(Span) -> O,
    pub make_missing_operator: fn(Span) -> Op,
    pub combine_errors: fn(Op, (O, O)) -> O,
    pub missing_operator_binding_power: BindingPower,
    // Why is this one so tricky?
    pub make_unknown_atom: fn(Span, I) -> O,
}

impl<I, Span, O, Op> Clone for PrattParseErrorHandler<I, Span, O, Op> {
    fn clone(&self) -> Self {
        Self {
            make_missing_atom: self.make_missing_atom.clone(),
            make_missing_operator: self.make_missing_operator.clone(),
            combine_errors: self.combine_errors.clone(),
            missing_operator_binding_power: self.missing_operator_binding_power.clone(),
            make_unknown_atom: self.make_unknown_atom.clone(),
        }
    }
}

pub struct PrattParser_<'a, I, O, E, AtomParser, OpParser, Op>
where
    I: Input<'a>,
{
    parselets: PrattParselets<AtomParser, OpParser, Op, O>,
    error_handler: PrattParseErrorHandler<I, I::Span, O, Op>,
    _phantom: std::marker::PhantomData<E>,
}

impl<'a, I, O, E, AtomParser, OpParser, Op> Clone
    for PrattParser_<'a, I, O, E, AtomParser, OpParser, Op>
where
    I: Input<'a>,
    AtomParser: Clone,
    OpParser: Clone,
{
    fn clone(&self) -> Self {
        Self {
            parselets: self.parselets.clone(),
            error_handler: self.error_handler.clone(),
            _phantom: std::marker::PhantomData,
        }
    }
}

enum ParseletParseResult<T, Left> {
    Some(T),
    /// Special pratt parsing case where we have a successful parse, but the binding power is too low.
    Left(Left),
    None,
}

impl<'a, I, O, E, AtomParser, OpParser, Op> PrattParser_<'a, I, O, E, AtomParser, OpParser, Op>
where
    I: chumsky::input::SliceInput<'a, Slice = I>,
    E: ParserExtra<'a, I>,
    AtomParser: Parser<'a, I, O, E>,
    OpParser: Parser<'a, I, Op, E>,
{
    /// Tries to run a single parselet
    /// Accepts the existing left expression, if and only if the parselet needs it
    fn parse_parselet<'pratt, 'parse>(
        &'pratt self,
        inp: &mut InputRef<'a, 'parse, I, E>,
        left: &mut Option<O>,
        min_strength: (u32, Strength),
        parselet: &'pratt PrattParselet<AtomParser, OpParser, Op, O>,
        error_next_parsers: &mut Vec<&'pratt PrattParseletKind<AtomParser, OpParser>>,
    ) -> ParseletParseResult<Vec<PrattParseResult<Op, O>>, O> {
        assert!(parselet.parsers.len() > 0);

        let mut results = Vec::new();
        let mut strength_right = None;

        // We determine if we should continue parsing based on the first parser that actually parses any content.
        // As opposed to the Expression kind, which just says "invoke the pratt parsing algorithm again".
        let mut parser_index = 0;
        if let PrattParseletKind::Expression(_p) = &parselet.parsers[parser_index] {
            assert!(
                left.is_some(),
                "left should exist when starting with an expression parse"
            );
            parser_index += 1;
            assert!(
                parselet.parsers.len() > parser_index,
                "Expression parser cannot exist by itself"
            );
            match &parselet.parsers[parser_index] {
                PrattParseletKind::Atom(p) => {
                    let marker = inp.save();
                    match inp.parse(&p.parser).ok() {
                        Some(v) => {
                            results.push(PrattParseResult::Expression(left.take().unwrap()));
                            results.push(PrattParseResult::Expression(v));
                        }
                        None => {
                            inp.rewind(marker);
                            return ParseletParseResult::None;
                        }
                    }
                }
                PrattParseletKind::Op(p) => {
                    parser_index += 1;
                    // Special pratt binding power case applies when
                    // 1. We have a left expression
                    // 2. And then we have an operator
                    // (aka infix or postfix cases)
                    let marker = inp.save();
                    match inp.parse(&p.parser).ok() {
                        Some(v) => {
                            if p.binding_power.strength_left() < min_strength {
                                inp.rewind(marker);
                                return ParseletParseResult::Left(left.take().unwrap());
                            } else {
                                results.push(PrattParseResult::Expression(left.take().unwrap()));
                                results.push(PrattParseResult::Op(v));
                                strength_right = Some(p.binding_power.strength_right());
                            }
                        }
                        None => {
                            inp.rewind(marker);
                            return ParseletParseResult::None;
                        }
                    }
                }
                PrattParseletKind::Expression(_) => {
                    panic!("Expression kind should not be used multiple times in a row");
                }
            }
        }

        // As soon as the first parser is successful, we definitely continue parsing until the end.

        for index in parser_index..parselet.parsers.len() {
            let result = match &parselet.parsers[index] {
                PrattParseletKind::Atom(p) => {
                    strength_right = None;
                    let marker = inp.save();
                    match inp.parse(&p.parser).ok() {
                        Some(v) => Some(PrattParseResult::Expression(v)),
                        None => {
                            inp.rewind(marker);
                            None
                        }
                    }
                }
                PrattParseletKind::Op(p) => {
                    strength_right = None;
                    let marker = inp.save();
                    match inp.parse(&p.parser).ok() {
                        Some(v) => {
                            strength_right = Some(p.binding_power.strength_right());
                            Some(PrattParseResult::Op(v))
                        }
                        None => {
                            inp.rewind(marker);
                            None
                        }
                    }
                }
                PrattParseletKind::Expression(_p) => {
                    let next_parsers_range = (index + 1)..parselet.parsers.len();
                    for next_parser_index in next_parsers_range.clone().rev() {
                        error_next_parsers.push(&parselet.parsers[next_parser_index]);
                    }
                    let pratt_parse_result = self.pratt_parse(
                        inp,
                        // TODO: This, or do we pass in the "min binding power"?
                        strength_right.take().unwrap_or((0, Strength::Weak)),
                        error_next_parsers,
                    );
                    for _ in next_parsers_range.clone().rev() {
                        error_next_parsers.pop();
                    }
                    pratt_parse_result.map(PrattParseResult::Expression)
                }
            };

            let do_recovery = match result {
                Some(v) => {
                    results.push(v);
                    false
                }
                None => true,
            };

            if do_recovery {
                let result = loop {
                    let is_at_end = inp.peek_maybe().is_none();
                    if is_at_end {
                        break self.make_missing(inp, &parselet.parsers[index]);
                    } else
                    // Usually there's only one more parser in this token that could parse, so we don't need to do any complicated skipping.
                    if parselet.parsers[index + 1..]
                        .iter()
                        .any(|p| self.could_parse(inp, p))
                    {
                        break self.make_missing(inp, &parselet.parsers[index]);
                    }
                    // Skip all if we encounter an "ending" parser.
                    else if error_next_parsers
                        .iter()
                        .rev()
                        .any(|p| self.could_parse(inp, p))
                    {
                        for p in parselet.parsers[index..].iter() {
                            results.push(self.make_missing(inp, p));
                        }
                        return ParseletParseResult::Some(results);
                    }
                    // Unknown token, onoes!
                    else {
                        // TODO: Error recovery
                    }
                };

                results.push(result);
            }
        }

        ParseletParseResult::Some(results)
    }

    fn parse_parselets<'pratt, 'parse>(
        &'pratt self,
        inp: &mut InputRef<'a, 'parse, I, E>,
        left_option: &mut Option<O>,
        min_strength: (u32, Strength),
        parselets: &'pratt [PrattParselet<AtomParser, OpParser, Op, O>],
        error_next_parsers: &mut Vec<&'pratt PrattParseletKind<AtomParser, OpParser>>,
    ) -> ParseletParseResult<O, O> {
        for parselet in parselets.iter() {
            match self.parse_parselet(
                inp,
                left_option,
                min_strength.clone(),
                parselet,
                error_next_parsers,
            ) {
                ParseletParseResult::Some(v) => {
                    return ParseletParseResult::Some((parselet.build)(v));
                }
                ParseletParseResult::Left(left) => {
                    return ParseletParseResult::Left(left);
                }
                ParseletParseResult::None => {}
            };
        }
        ParseletParseResult::None
    }

    fn could_parse(
        &self,
        inp: &mut InputRef<'a, '_, I, E>,
        parselet: &PrattParseletKind<AtomParser, OpParser>,
    ) -> bool {
        let marker = inp.save();

        let result = match parselet {
            PrattParseletKind::Atom(p) => inp.check(&p.parser).is_ok(),
            PrattParseletKind::Op(p) => inp.check(&p.parser).is_ok(),
            PrattParseletKind::Expression(_p) => {
                // Perf: This could be computed once instead of every time.
                let mut starting_expression_parsers = self
                    .parselets
                    .parselets_starting_with_atom
                    .iter()
                    .chain(self.parselets.parselets_starting_with_expression.iter())
                    .chain(self.parselets.parselets_starting_with_op.iter())
                    .filter_map(|parselet| {
                        parselet.parsers.iter().find(|parser| match parser {
                            PrattParseletKind::Atom(_) => true,
                            PrattParseletKind::Op(_) => true,
                            PrattParseletKind::Expression(_p) => false,
                        })
                    });

                starting_expression_parsers.any(|parser| match parser {
                    PrattParseletKind::Atom(p) => inp.check(&p.parser).is_ok(),
                    PrattParseletKind::Op(p) => inp.check(&p.parser).is_ok(),
                    PrattParseletKind::Expression(_) => false,
                })
            }
        };

        inp.rewind(marker);
        result
    }

    fn make_missing(
        &self,
        inp: &mut InputRef<'a, '_, I, E>,
        parselet: &PrattParseletKind<AtomParser, OpParser>,
    ) -> PrattParseResult<Op, O> {
        let position = get_position(inp);
        match parselet {
            PrattParseletKind::Atom(_) => {
                PrattParseResult::Expression((self.error_handler.make_missing_atom)(position))
            }
            PrattParseletKind::Op(_) => {
                PrattParseResult::Op((self.error_handler.make_missing_operator)(position))
            }
            PrattParseletKind::Expression(_) => {
                PrattParseResult::Expression((self.error_handler.make_missing_atom)(position))
            }
        }
    }

    /// Pratt parsing. Will return None if there's nothing to parse, for example if the input is empty or if the first character is unknown.
    /// Will do error recovery, for example if the first character is an operator.
    /// Will politely rewind the input if it fails to parse.
    ///
    /// * `error_next_parsers`: Holds the next parsers in reverse order. Like a stack.
    fn pratt_parse<'pratt, 'parse>(
        &'pratt self,
        inp: &mut InputRef<'a, 'parse, I, E>,
        min_strength: (u32, Strength),
        error_next_parsers: &mut Vec<&'pratt PrattParseletKind<AtomParser, OpParser>>,
    ) -> Option<O> {
        let mut left = match self.parse_parselets(
            inp,
            &mut None,
            min_strength.clone(),
            &self.parselets.parselets_starting_with_expression,
            error_next_parsers,
        ) {
            ParseletParseResult::Some(v) => Some(v),
            ParseletParseResult::Left(_) => {
                panic!("Expression parselet should never return Left");
            }
            ParseletParseResult::None => None,
        };
        if left.is_none() {
            left = match self.parse_parselets(
                inp,
                &mut None,
                min_strength.clone(),
                &self.parselets.parselets_starting_with_atom,
                error_next_parsers,
            ) {
                ParseletParseResult::Some(v) => Some(v),
                ParseletParseResult::Left(_) => {
                    panic!("Expression parselet should never return Left");
                }
                ParseletParseResult::None => None,
            };
        }

        // Attempt "missing operand" recovery.
        // This recovery here should *not* do "unknown token" recovery, since that might end up going way overboard.
        let mut left = match left {
            Some(v) => v,
            None => {
                let mut left_option =
                    Some((self.error_handler.make_missing_atom)(get_position(inp)));
                match self.parse_parselets(
                    inp,
                    &mut left_option,
                    min_strength.clone(),
                    &self.parselets.parselets_starting_with_op,
                    error_next_parsers,
                ) {
                    ParseletParseResult::Some(v) => v,
                    ParseletParseResult::Left(left) => {
                        // Success, but the binding power is too low.
                        return Some(left);
                    }
                    ParseletParseResult::None => {
                        // No operator was found
                        return None;
                    }
                }
            }
        };

        loop {
            let mut left_option = Some(left);
            left = match self.parse_parselets(
                inp,
                &mut left_option,
                min_strength.clone(),
                &self.parselets.parselets_starting_with_op,
                error_next_parsers,
            ) {
                ParseletParseResult::Some(v) => v,
                ParseletParseResult::Left(left) => {
                    return Some(left);
                }
                ParseletParseResult::None => {
                    // No more operators to parse.
                    let left = left_option.expect("Left should not have been consumed");

                    // Attempt "missing operator" recovery.
                    // TODO: Confirm that this is correct:
                    // This is one of the few times where there's no real "else case".
                    // Therefore it is legal to first check the binding power, and then do the parsing.
                    if self
                        .error_handler
                        .missing_operator_binding_power
                        .strength_left()
                        < min_strength
                    {
                        return Some(left);
                    }
                    let start_offset = get_position(inp);
                    let next_expression = self.pratt_parse(
                        inp,
                        self.error_handler
                            .missing_operator_binding_power
                            .strength_right(),
                        error_next_parsers,
                    );
                    match next_expression {
                        Some(v) => {
                            return Some((self.error_handler.combine_errors)(
                                (self.error_handler.make_missing_operator)(start_offset),
                                (left, v),
                            ));
                        }
                        None => {
                            return Some(left);
                        }
                    }
                }
            };
        }
    }
}

fn get_position<'a, I: Input<'a>, E: ParserExtra<'a, I>>(
    inp: &mut InputRef<'a, '_, I, E>,
) -> I::Span {
    inp.parse(empty().map_with_span(|_, span| span))
        .unwrap_or_else(|_| panic!("should never happen"))
}

impl<'a, I, O, E, AtomParser, OpParser, Op> ExtParser<'a, I, O, E>
    for PrattParser_<'a, I, O, E, AtomParser, OpParser, Op>
where
    I: chumsky::input::SliceInput<'a, Slice = I>,
    E: ParserExtra<'a, I>,
    AtomParser: Parser<'a, I, O, E>,
    OpParser: Parser<'a, I, Op, E>,
{
    /// Applies a pratt parser *until the end of the input*.
    /// Will do agressive error recovery to do so.
    /// For a less agressive different behaviour, use [`PrattParser_::pratt_parse`].
    fn parse<'parse>(&self, inp: &mut InputRef<'a, 'parse, I, E>) -> Result<O, E::Error> {
        // TODO: A single "(Error::MissingToken)" should become "(BuiltIn::Nothing)"
        match self.pratt_parse(inp, (0, Strength::Weak), &mut vec![]) {
            Some(v) => Ok(v),
            None => {
                // TODO: Actually, let's do agressive error recovery here.
                let before = inp.offset();
                // Could report slightly better errors here, but it's not really worth it.
                Err(E::Error::expected_found(
                    [],
                    inp.next_maybe(),
                    inp.span_since(before),
                ))
            }
        }
    }
}

pub type PrattParser<'a, I, O, E, AtomParser, OpParser, Op> =
    Ext<PrattParser_<'a, I, O, E, AtomParser, OpParser, Op>>;

pub fn pratt_parser<'a, I, O, E, AtomParser, OpParser, Op>(
    parselets: PrattParselets<AtomParser, OpParser, Op, O>,
    error_handler: PrattParseErrorHandler<I, I::Span, O, Op>,
) -> PrattParser<'a, I, O, E, AtomParser, OpParser, Op>
where
    I: chumsky::input::SliceInput<'a, Slice = I>,
{
    Ext(PrattParser_ {
        parselets,
        error_handler,
        _phantom: std::marker::PhantomData,
    })
}

impl BindingPower {
    /// Note that strength is pretty much "reversed".
    /// See https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html
    fn strength_left(&self) -> (u32, Strength) {
        match self.associativity {
            Associativity::Left => (self.binding_power, Strength::Weak),
            Associativity::Right => (self.binding_power, Strength::Strong),
        }
    }

    fn strength_right(&self) -> (u32, Strength) {
        match self.associativity {
            Associativity::Left => (self.binding_power, Strength::Strong),
            Associativity::Right => (self.binding_power, Strength::Weak),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Ord, PartialOrd)]
enum Strength {
    Weak,
    Strong,
}
