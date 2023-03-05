mod math_layout;
mod parser;
mod utils;

use chumsky::Parser;
use math_layout::{element::MathElement, row::Row};
use utils::set_panic_hook;
use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet() {
    set_panic_hook();
    alert("Hello, aftermath-core!");

    let layout = Row::new(vec![
        MathElement::Symbol("a".to_string()),
        MathElement::Fraction([
            Row::new(vec![MathElement::Symbol("b".to_string())]),
            Row::new(vec![MathElement::Symbol("c".to_string())]),
        ]),
    ]);

    let p = parser::parser();
    let parsed = p.parse(&layout.values);
    println!("{:?}", parsed);
}

// tests
#[cfg(test)]
mod tests {
    use super::*;
    use chumsky::Parser;
    use math_layout::{element::MathElement, row::Row};

    #[test]
    fn test_parser() {
        let layout = Row::new(vec![
            MathElement::Symbol("a".to_string()),
            MathElement::Fraction([
                Row::new(vec![MathElement::Symbol("b".to_string())]),
                Row::new(vec![MathElement::Symbol("c".to_string())]),
            ]),
        ]);

        let p = parser::parser();
        let parsed = p.parse(&layout.values);
        println!("{:?}", parsed);
    }
}
