use caret::{
    math_editor::{MathEditor, SerializedDataType},
    primitive::{primitive_edit::CaretRemoveMode, MoveMode},
};
use input_tree::{
    direction::Direction,
    focus::{MinimalInputRowPosition, MinimalInputRowRange},
    node::InputNode,
};
use parser::parse_rules::ParserRules;
use serde::Serialize;
use wasm_bindgen::{prelude::wasm_bindgen, JsValue};

#[wasm_bindgen]
pub struct MathEditorBindings {
    editor: MathEditor,
    serializer: serde_wasm_bindgen::Serializer,
}

#[wasm_bindgen]
impl MathEditorBindings {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            // Hardcoded parser rules for now
            editor: MathEditor::new(ParserRules::default()),
            // Do note that large numbers won't be serialized correctly, because JS doesn't have 64 bit integers.
            serializer: serde_wasm_bindgen::Serializer::new(),
        }
    }

    pub fn focus(&mut self) {
        self.editor.focus();
    }

    pub fn unfocus(&mut self) {
        self.editor.unfocus();
    }

    pub fn move_caret(&mut self, direction: Direction, mode: MoveMode) {
        self.editor.move_caret(direction, mode);
    }

    pub fn select_with_caret(&mut self, direction: Direction, mode: MoveMode) -> bool {
        self.editor.select_with_caret(direction, mode).is_some()
    }

    pub fn remove_at_caret(&mut self, mode: CaretRemoveMode) -> bool {
        self.editor.remove_at_caret(mode, MoveMode::Char).is_some()
    }

    pub fn insert_at_caret(&mut self, values: JsValue) -> Result<bool, JsValue> {
        let values: Vec<String> = serde_wasm_bindgen::from_value(values)?;
        Ok(self.editor.insert_at_caret(values).is_some())
    }

    pub fn select_all(&mut self) {
        self.editor.select_all();
    }

    pub fn undo(&mut self) -> bool {
        self.editor.undo().is_some()
    }

    pub fn redo(&mut self) -> bool {
        self.editor.redo().is_some()
    }

    pub fn start_selection(&mut self, position: MinimalInputRowPosition, mode: MoveMode) {
        self.editor.start_selection(position, mode);
    }
    pub fn extend_selection(&mut self, position: MinimalInputRowPosition) {
        self.editor.extend_selection(position);
    }
    pub fn finish_selection(&mut self) {
        self.editor.finish_selection();
    }

    pub fn copy(&mut self, data_type: SerializedDataType) -> Result<String, String> {
        self.editor.copy(data_type).map_err(|e| e.to_string())
    }

    pub fn paste(
        &mut self,
        data: String,
        data_type: Option<SerializedDataType>,
    ) -> Result<(), String> {
        self.editor
            .paste(data, data_type)
            .map_err(|e| e.to_string())
    }
    // autocomplete

    pub fn get_syntax_tree(&mut self) -> Result<JsValue, JsValue> {
        let result = self.editor.get_syntax_tree().serialize(&self.serializer)?;
        Ok(result)
    }

    pub fn get_parse_errors(&mut self) -> Result<JsValue, JsValue> {
        let result = self.editor.get_parse_errors().serialize(&self.serializer)?;
        Ok(result)
    }

    pub fn get_caret(&self) -> Result<JsValue, JsValue> {
        let result = self.editor.get_caret().serialize(&self.serializer)?;
        Ok(result)
    }

    pub fn splice_at_range(
        &mut self,
        range: MinimalInputRowRange,
        values: JsValue,
    ) -> Result<(), JsValue> {
        let values: Vec<InputNode> = serde_wasm_bindgen::from_value(values)?;
        self.editor.splice_at_range(range, values);
        Ok(())
    }

    pub fn get_token_names(&self) -> Result<JsValue, JsValue> {
        let result = self.editor.get_token_names().serialize(&self.serializer)?;
        Ok(result)
    }
}
