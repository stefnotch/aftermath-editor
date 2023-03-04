mod math_layout;
mod utils;

use chumsky::{prelude::Simple, Parser};
use math_layout::{element::MathElement, row::Row};
use utils::set_panic_hook;
use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

/// https://github.com/cortex-js/compute-engine/issues/25
#[derive(Clone)]
enum MathSemantic {
    // +, *
    // fraction
    // function with args
    // needs to keep the range info
}

#[derive(Debug)]
enum Expr {
    Num(f64),
    Var(String),

    Neg(Box<Expr>),
    Add(Box<Expr>, Box<Expr>),
    Sub(Box<Expr>, Box<Expr>),
    Mul(Box<Expr>, Box<Expr>),
    Div(Box<Expr>, Box<Expr>),

    Call(String, Vec<Expr>),
    Let {
        name: String,
        rhs: Box<Expr>,
        then: Box<Expr>,
    },
    Fn {
        name: String,
        args: Vec<String>,
        body: Box<Expr>,
        then: Box<Expr>,
    },
}

fn parser() -> impl Parser<char, Expr, Error = Simple<char>> {
    chumsky::primitive::filter(|c: &char| c.is_ascii_digit())
        .map_with_span(|c, s| Expr::Num(c.to_digit(10).unwrap() as f64))
        .then_ignore(chumsky::primitive::end())
}

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet() {
    set_panic_hook();
    alert("Hello, aftermath-core!");

    let x = parser();

    let layout = Row::new(vec![
        MathElement::Symbol("a".to_string()),
        MathElement::Fraction([
            Row::new(vec![MathElement::Symbol("b".to_string())]),
            Row::new(vec![MathElement::Symbol("c".to_string())]),
        ]),
    ]);
}
