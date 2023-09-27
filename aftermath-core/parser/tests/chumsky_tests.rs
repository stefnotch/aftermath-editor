use std::sync::Arc;

use chumsky::{
    extension::v1::{Ext, ExtParser},
    extra::{self, ParserExtra},
    prelude::{EmptyErr, Input},
    primitive::map_ctx,
    recursive::recursive,
    text, Boxed, IterParser, Parser,
};

#[derive(Clone, Debug, Default)]
struct TestContext {
    value: char,
}

#[test]
fn test_chumsky_basic_context() {
    let number = text::digits::<char, &str, extra::Full<EmptyErr, (), TestContext>>(10)
        .exactly(1)
        .collect::<Vec<_>>()
        .map_with_ctx(|result, ctx| {
            if ctx.value == result[0] {
                Some(result[0])
            } else {
                None
            }
        })
        .boxed();

    let parse_one: Boxed<_, _, extra::Full<_, _, TestContext>> =
        number.clone().with_ctx(TestContext { value: '1' }).boxed();
    assert_eq!(parse_one.parse("1").into_output(), Some(Some('1')));

    let parse_two: Boxed<_, _, extra::Full<_, _, TestContext>> =
        number.with_ctx(TestContext { value: '2' }).boxed();
    assert_eq!(parse_two.parse("2").into_output(), Some(Some('2')));

    let parse_one_two = parse_one.then(parse_two).boxed();
    assert_eq!(
        parse_one_two.parse("12").into_output(),
        Some((Some('1'), Some('2')))
    );
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct NumberTree {
    a: char,
    b: Option<Box<NumberTree>>,
    c: char,
}

#[derive(Clone)]
struct ParserFn_<P> {
    parser: Arc<P>,
}

impl<'a, P, I, O, E> ExtParser<'a, I, O, E> for ParserFn_<P>
where
    I: Input<'a>,
    E: ParserExtra<'a, I>,
    P: Fn(&mut chumsky::input::InputRef<'a, '_, I, E>) -> Result<O, E::Error>,
{
    fn parse(&self, inp: &mut chumsky::input::InputRef<'a, '_, I, E>) -> Result<O, E::Error> {
        (self.parser)(inp)
    }
}

type ParserFn<P> = Ext<ParserFn_<P>>;
fn parser_fn<'a, P, I, O, E>(parser: P) -> ParserFn<P>
where
    I: Input<'a>,
    E: ParserExtra<'a, I>,
    P: Fn(&mut chumsky::input::InputRef<'a, '_, I, E>) -> Result<O, E::Error>,
{
    Ext(ParserFn_ {
        parser: Arc::new(parser),
    })
}

#[test]
fn test_chumsky_recursive_context() {
    let number = parser_fn::<_, _, _, extra::Full<EmptyErr, (), TestContext>>(|inp| {
        let ctx_value = inp.ctx().value;
        inp.next()
            .map(move |c| {
                if c == ctx_value {
                    Ok(c)
                } else {
                    Err(EmptyErr::default())
                }
            })
            .unwrap_or_else(move || Err(EmptyErr::default()))
    })
    .boxed();

    let number_tree = recursive(|parser| {
        let base_number = map_ctx::<_, _, _, extra::Full<EmptyErr, (), _>, _, _>(
            |ctx: &TestContext| ctx.clone(),
            number,
        )
        .boxed();

        let nested_parser = map_ctx::<_, _, _, extra::Full<EmptyErr, (), _>, _, _>(
            |ctx: &TestContext| {
                let mut copy = ctx.clone();
                copy.value = add1_char(copy.value);
                copy
            },
            parser,
        )
        .boxed();

        base_number
            .clone()
            .then(nested_parser.or_not())
            .map_with_ctx(|v, ctx| v)
            .then(base_number)
            .map(|((a, b), c)| NumberTree {
                a,
                b: b.map(Box::new),
                c,
            })
    });

    let parser: Boxed<_, _, extra::Full<_, _, TestContext>> = number_tree
        .clone()
        .with_ctx(TestContext { value: '0' })
        .boxed();

    assert_eq!(
        parser.parse("00").into_output(),
        Some(NumberTree {
            a: '0',
            b: None,
            c: '0',
        })
    );

    assert_eq!(
        parser.parse("0110").into_output(),
        Some(NumberTree {
            a: '0',
            b: Some(Box::new(NumberTree {
                a: '1',
                b: None,
                c: '1'
            })),
            c: '0'
        })
    );
}

fn add1_char(c: char) -> char {
    char::from_u32(c as u32 + 1).unwrap_or(c)
}
