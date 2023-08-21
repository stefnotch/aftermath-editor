use chumsky::{
    error::Error,
    extension::v1::{Ext, ExtParser},
    extra::ParserExtra,
    input::InputRef,
    prelude::Input,
    Parser,
};
/// Will apply all parsers, and then pick the one with the longest match.
/// Be careful about exponential blowup when nesting this.
/// Implementation similar to Chumsky's choice.
#[derive(Clone)]
pub struct GreedyChoice_<T> {
    parsers: Vec<T>,
}

pub trait HasLen {
    fn len(&self) -> usize;
}

impl<'a, A, I, O, E> ExtParser<'a, I, O, E> for GreedyChoice_<A>
where
    A: Parser<'a, I, O, E>,
    I: Input<'a>,
    O: HasLen,
    E: ParserExtra<'a, I>,
{
    // Based on https://github.com/zesterer/chumsky/blob/771cfcb8db72388cf83679e74df9f7b75fe49e2e/src/primitive.rs#L875
    fn parse(&self, inp: &mut InputRef<'a, '_, I, E>) -> Result<O, E::Error> {
        if self.parsers.is_empty() {
            let offs = inp.offset();
            let err_span = inp.span_since(offs);
            Err(E::Error::expected_found(None, None, err_span))
        } else {
            let before = inp.save();
            match self
                .parsers
                .iter()
                .map(|parser| {
                    inp.rewind(before);
                    inp.parse(parser)
                })
                .max_by_key(|a| match a {
                    Ok(a) => a.len(),
                    Err(_) => 0,
                }) {
                Some(Ok(longest_match)) => Ok(longest_match),
                Some(Err(e)) => Err(e),
                None => panic!("Parsers list was empty"),
            }
        }
    }
}

pub type GreedyChoice<T> = Ext<GreedyChoice_<T>>;

pub fn greedy_choice<T>(parsers: Vec<T>) -> GreedyChoice<T> {
    assert!(
        parsers.len() > 0,
        "Need at least one parser for greedy choice"
    );
    Ext(GreedyChoice_ { parsers })
}
