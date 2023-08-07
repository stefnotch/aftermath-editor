pub mod math_editor;
mod utils;

use input_tree::{node::InputNode, row::InputRow};
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

/*
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
*/
