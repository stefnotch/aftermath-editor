mod utils;

use input_tree::row::InputRow;
use parser::{parse_rules::ParserRules, ParseError, ParseResult, SyntaxNode};
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
    value: SyntaxNode,
    errors: Vec<ParseError>,
}

#[wasm_bindgen]
pub struct MathParser {
    parser_rules: ParserRules<'static>,
    serializer: serde_wasm_bindgen::Serializer,
}

#[wasm_bindgen]
impl MathParser {
    pub fn new() -> Self {
        Self {
            parser_rules: ParserRules::default(),
            serializer: serde_wasm_bindgen::Serializer::new()
                .serialize_large_number_types_as_bigints(true),
        }
    }

    pub fn parse(&self, layout_row: JsValue) -> Result<JsValue, JsValue> {
        let layout: InputRow = serde_wasm_bindgen::from_value(layout_row)?;

        // let transformer = AstTransformer::new();
        let mut parsed: MathParseResult = parser::parse_row(&layout, &self.parser_rules).into();
        //  parsed.value = transformer.transform(parsed.value);

        let serialized_result = parsed.serialize(&self.serializer)?;
        Ok(serialized_result)
    }

    pub fn get_token_names(&self) -> Result<JsValue, JsValue> {
        let token_names = self.parser_rules.get_token_names();
        let serialized_result = token_names.serialize(&self.serializer)?;
        Ok(serialized_result)
    }
}

impl From<ParseResult<SyntaxNode>> for MathParseResult {
    fn from(result: ParseResult<SyntaxNode>) -> Self {
        MathParseResult {
            value: result.value,
            errors: result.errors,
        }
    }
}
