mod math_layout;
mod parser;
mod utils;

use math_layout::{element::MathElement, row::Row};
use parser::{MathSemantic, ParseContext};
use serde::Serialize;
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
}

#[wasm_bindgen]
pub fn parse(layout_row: JsValue) -> Result<JsValue, JsValue> {
    let layout: Row = serde_wasm_bindgen::from_value(layout_row)?;

    let context = ParseContext::new();
    let parsed = parser::parse(&layout, &context);

    let serializer =
        serde_wasm_bindgen::Serializer::new().serialize_large_number_types_as_bigints(true);
    let serialized_result = parsed.serialize(&serializer)?;
    Ok(serialized_result)
}
