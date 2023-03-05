use chumsky::prelude::*;
use chumsky::{primitive::just, Parser};

use crate::math_layout::{element::MathElement, row::Row};

/// https://github.com/cortex-js/compute-engine/issues/25
/// mimics the math layout tree
#[derive(Debug)]
pub struct MathSemantic {
    /// name of the function or constant
    pub name: String,
    /// arguments of the function
    /// if the function is a constant, this is empty
    pub args: Vec<MathSemantic>,
    /// value, especially for constants
    /// stored as bytes, and interpreted according to the name
    pub value: Vec<u8>,
    /// the range of this in the original math layout
    pub range: (usize, usize),
}

fn parser_x<'a>() -> impl Parser<'a, &'a [MathElement], MathSemantic> {
    just(MathElement::Symbol("e".to_owned())).map(|v| MathSemantic {
        name: "e".to_owned(),
        args: vec![],
        value: "e".to_owned().into_bytes(),
        range: (0, 0),
    })
}

pub fn parser<'a>() -> impl Parser<'a, &'a [MathElement], MathSemantic, extra::Default> {
    recursive(|expr| {
        // But why did I need to specify the type here?
        // : chumsky::primitive::SelectRef<_, &[MathElement], _, extra::Default>
        let digit = select_ref! {
            MathElement::Symbol(s) if s.chars().all(|c| c.is_digit(10)) => s.as_str(),
        };

        let number = digit.repeated().at_least(1).collect::<Vec<_>>().map(|v| {
            let value = v.join("");
            MathSemantic {
                name: "number".into(),
                args: vec![],
                value: value.into_bytes(),
                range: (0, 0),
            }
        });

        // TODO: Maybe .custom for parsing the nested elements?

        /*let digit = any::<&'a [MathElement], extra::Default>()
        .filter(|c: &MathElement| match c {
            MathElement::Symbol(s) => s.chars().all(|c| c.is_digit(10)),
            _ => false,
        })
        .map(|v| MathSemantic {
            name: "number".into(),
            args: vec![],
            value: "3".to_owned().into_bytes(),
            range: (0, 0),
        });*/
        number
    })
}

/*
fn row_parser<'a>(
) -> impl Parser<&'a [MathElement], MathSemantic, Error = Simple<&'a [MathElement]>> {
    let digit = filter(|c: &MathElement| match c {
        MathElement::Symbol(s) => s.chars().all(|c| c.is_digit(10)),
        _ => false,
    })
    .map(|c: MathElement| match c {
        MathElement::Symbol(s) => s,
        _ => unreachable!(),
    });

    let number = digit
        //.repeated()
        //.at_least(1)
        //.collect::<String>()
        .map(|v| MathSemantic {
            name: "number".into(),
            args: vec![],
            value: v.into_bytes(),
            range: (0, 0),
        });
    // TODO:

    number
}

pub struct MathParser {
    // TODO: use https://docs.rs/chumsky/0.9.2/chumsky/error/struct.Simple.html
    row_parser: Box<dyn Parser<MathElement, MathSemantic, Error = Cheap<MathElement>>>,
}

impl MathParser {
    pub fn new() -> Self {
        MathParser {
            row_parser: Box::new(row_parser()),
        }
    }

    pub fn parse(&self, row: &Row) -> Result<MathSemantic, Vec<Cheap<MathElement>>> {
        self.row_parser
            .parse(chumsky::stream::Stream::from_iter(row.values))
    }
}
 */
