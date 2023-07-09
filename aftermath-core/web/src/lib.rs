mod utils;

use input_tree::{input_node::InputNode, row::InputRow};
use parser::{parse_rules::ParserRules, ParseError, ParseResult, SyntaxNode};
use serde::{Deserialize, Serialize};
use utils::set_panic_hook;
use wasm_bindgen::prelude::*;

// TODO: Or maybe just use the default allocator
#[cfg(target_arch = "wasm32")]
use lol_alloc::{FreeListAllocator, LockedAllocator};

#[cfg(target_arch = "wasm32")]
#[global_allocator]
static ALLOCATOR: LockedAllocator<FreeListAllocator> =
    LockedAllocator::new(FreeListAllocator::new());

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

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

#[derive(Serialize, Deserialize)]
/// Only for temporary copy-pasting
struct JsonSerializedFormula {
    input: InputRow,
}

#[wasm_bindgen]
impl MathParser {
    pub fn new() -> Self {
        Self {
            parser_rules: ParserRules::default(),
            // Do note that large numbers won't be serialized correctly, because JS doesn't have 64 bit integers.
            serializer: serde_wasm_bindgen::Serializer::new(),
        }
    }

    pub fn parse(&self, layout_row: JsValue) -> Result<JsValue, JsValue> {
        let layout: InputRow = serde_wasm_bindgen::from_value(layout_row)?;

        let parsed: MathParseResult = parser::parse_row(&layout, &self.parser_rules).into();

        let serialized_result = parsed.serialize(&self.serializer)?;
        Ok(serialized_result)
    }

    pub fn autocomplete(&self, input_nodes: JsValue) -> Result<JsValue, JsValue> {
        let nodes: Vec<InputNode> = serde_wasm_bindgen::from_value(input_nodes)?;
        let result = self.parser_rules.get_autocomplete(&nodes);
        let serialized_result = result.serialize(&self.serializer)?;
        Ok(serialized_result)
    }

    pub fn beginning_autocomplete(&self, input_nodes: JsValue) -> Result<JsValue, JsValue> {
        let nodes: Vec<InputNode> = serde_wasm_bindgen::from_value(input_nodes)?;
        let result = self
            .parser_rules
            .get_finished_autocomplete_at_beginning(&nodes);
        let serialized_result = result.serialize(&self.serializer)?;
        Ok(serialized_result)
    }

    pub fn get_token_names(&self) -> Result<JsValue, JsValue> {
        let token_names = self.parser_rules.get_token_names();
        let serialized_result = token_names.serialize(&self.serializer)?;
        Ok(serialized_result)
    }

    pub fn serialize(&self, layout_row: JsValue) -> Result<String, JsValue> {
        let layout: InputRow = serde_wasm_bindgen::from_value(layout_row)?;
        let value = JsonSerializedFormula { input: layout };

        let json_string = serde_json::to_string(&value)
            .map_err(|e| serde_wasm_bindgen::Error::new(e.to_string()))?;
        Ok(json_string)
    }

    pub fn deserialize(&self, json_string: String) -> Result<JsValue, JsValue> {
        let value: InputRow = serde_json::from_str(&json_string)
            .map(|v: JsonSerializedFormula| v.input)
            .map_err(|e| serde_wasm_bindgen::Error::new(e.to_string()))?;
        let serialized_result = value.serialize(&self.serializer)?;
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
