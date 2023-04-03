mod math_layout;
mod parser;
mod utils;

use math_layout::row::Row;
use parser::{parse_context::ParseContext, MathSemantic, ParseError, ParseResult};
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

#[wasm_bindgen(start)]
fn main() {
    set_panic_hook();
}

#[derive(Serialize)]
struct MathParseResult {
    value: MathSemantic,
    errors: Vec<ParseError>,
}

#[wasm_bindgen]
pub fn parse(layout_row: JsValue) -> Result<JsValue, JsValue> {
    let layout: Row = serde_wasm_bindgen::from_value(layout_row)?;

    let context = ParseContext::default();
    let parsed: MathParseResult = parser::parse(&layout, &context).into();

    let serializer =
        serde_wasm_bindgen::Serializer::new().serialize_large_number_types_as_bigints(true);

    let serialized_result = parsed.value.serialize(&serializer)?;
    Ok(serialized_result)
}

impl From<ParseResult<MathSemantic>> for MathParseResult {
    fn from(result: ParseResult<MathSemantic>) -> Self {
        MathParseResult {
            value: result.value,
            errors: result.errors,
        }
    }
}
