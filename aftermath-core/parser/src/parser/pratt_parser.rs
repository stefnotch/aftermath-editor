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
    pub missing_operator_binding_power: BindingPower,
    // Why is this one so tricky?
    pub make_unknown_atom: fn(Span, I) -> O,
}

impl<I, Span, O, Op> Clone for PrattParseErrorHandler<I, Span, O, Op> {
    fn clone(&self) -> Self {
        Self {
            make_missing_atom: self.make_missing_atom.clone(),
            make_missing_operator: self.make_missing_operator.clone(),
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
    fn parse_parselet<'parse>(
        &self,
        left: &mut Option<O>,
        min_strength: (u32, Strength),
        parselet: &PrattParselet<AtomParser, OpParser, Op, O>,
        inp: &mut InputRef<'a, 'parse, I, E>,
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
                PrattParseletKind::Expression(_) => {
                    panic!("Expression kind should only be used once");
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
            }
        }
        assert!(left.is_none());

        // As soon as the first parser is successful, we definitely continue parsing until the end.

        for parser in parselet.parsers[parser_index..].iter() {
            match parser {
                PrattParseletKind::Atom(p) => {
                    let marker = inp.save();
                    match inp.parse(&p.parser).ok() {
                        Some(v) => {
                            results.push(PrattParseResult::Expression(v));
                            strength_right = None;
                        }
                        None => {
                            inp.rewind(marker);
                            // TODO: recovery
                        }
                    }
                }
                PrattParseletKind::Expression(_p) => {
                    // TODO: This, or do we pass in the "min binding power"?
                    match self.pratt_parse(inp, strength_right.unwrap_or((0, Strength::Weak))) {
                        Some(v) => {
                            results.push(PrattParseResult::Expression(v));
                        }
                        None => {
                            // TODO: recovery
                        }
                    }
                    strength_right = None;
                }
                PrattParseletKind::Op(p) => {
                    let marker = inp.save();
                    match inp.parse(&p.parser).ok() {
                        Some(v) => {
                            results.push(PrattParseResult::Op(v));
                            strength_right = Some(p.binding_power.strength_right());
                        }
                        None => {
                            inp.rewind(marker);
                            // TODO: recovery
                        }
                    }
                }
            }
        }

        ParseletParseResult::Some(results)
    }

    fn parse_parselets<'parse>(
        &self,
        left_option: &mut Option<O>,
        min_strength: (u32, Strength),
        parselets: &[PrattParselet<AtomParser, OpParser, Op, O>],
        inp: &mut InputRef<'a, 'parse, I, E>,
    ) -> ParseletParseResult<O, O> {
        for parselet in parselets.iter() {
            match self.parse_parselet(left_option, min_strength.clone(), parselet, inp) {
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

    /// Pratt parsing. Will return None if there's nothing to parse, for example if the input is empty or if the first character is unknown.
    /// Will politely rewind the input if it fails to parse.
    fn pratt_parse<'parse>(
        &self,
        inp: &mut InputRef<'a, 'parse, I, E>,
        min_strength: (u32, Strength),
    ) -> Option<O> {
        let mut left = match self.parse_parselets(
            &mut None,
            min_strength.clone(),
            &self.parselets.parselets_starting_with_expression,
            inp,
        ) {
            ParseletParseResult::Some(v) => Some(v),
            ParseletParseResult::Left(_) => {
                panic!("Expression parselet should never return Left");
            }
            ParseletParseResult::None => None,
        };
        if left.is_none() {
            left = match self.parse_parselets(
                &mut None,
                min_strength.clone(),
                &self.parselets.parselets_starting_with_atom,
                inp,
            ) {
                ParseletParseResult::Some(v) => Some(v),
                ParseletParseResult::Left(_) => {
                    panic!("Expression parselet should never return Left");
                }
                ParseletParseResult::None => None,
            };
        }

        // If we haven't managed to parse anything, we should return None.
        // Alternatively we could try to do "missing token" recovery here, but that's not going to happen here for now.
        let mut left = left?;

        loop {
            let mut left_option = Some(left);
            left = match self.parse_parselets(
                &mut left_option,
                min_strength.clone(),
                &self.parselets.parselets_starting_with_op,
                inp,
            ) {
                ParseletParseResult::Some(v) => v,
                ParseletParseResult::Left(left) => {
                    return Some(left);
                }
                ParseletParseResult::None => {
                    // No more operators to parse, so we're done.
                    return Some(left_option.expect("Left should not have been consumed"));
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
    fn parse<'parse>(&self, inp: &mut InputRef<'a, 'parse, I, E>) -> Result<O, E::Error> {
        // TODO: A single "(Error::MissingToken)" should become "(BuiltIn::Nothing)"
        match self.pratt_parse(inp, (0, Strength::Weak)) {
            Some(v) => Ok(v),
            None => {
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
