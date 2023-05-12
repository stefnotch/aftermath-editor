mod utils;

use input_tree::row::InputRow;
use parser::{
    ast_transformer::AstTransformer, parse_rules::ParserRules, ParseError, ParseResult,
    SyntaxContainerNode,
};
use serde::Serialize;
use utils::set_panic_hook;
use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
extern "C" {}

#[wasm_bindgen(start)]
fn main() {
    set_panic_hook();
}

#[derive(Serialize)]
struct MathParseResult {
    value: SyntaxContainerNode,
    errors: Vec<ParseError>,
}

#[wasm_bindgen]
pub fn parse(layout_row: JsValue) -> Result<JsValue, JsValue> {
    let layout: InputRow = serde_wasm_bindgen::from_value(layout_row)?;

    let context = ParserRules::default();
    let transformer = AstTransformer::new();
    let mut parsed: MathParseResult = parser::parse_row(&layout, &context).into();
    parsed.value = transformer.transform(parsed.value);

    let serializer =
        serde_wasm_bindgen::Serializer::new().serialize_large_number_types_as_bigints(true);

    let serialized_result = parsed.serialize(&serializer)?;
    Ok(serialized_result)
}

impl From<ParseResult<SyntaxContainerNode>> for MathParseResult {
    fn from(result: ParseResult<SyntaxContainerNode>) -> Self {
        MathParseResult {
            value: result.value,
            errors: result.errors,
        }
    }
}
