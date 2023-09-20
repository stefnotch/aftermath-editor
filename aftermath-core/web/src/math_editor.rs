use std::sync::Arc;

use caret::{
    math_editor::{AutocompleteResults, MathEditor, SerializedDataType},
    primitive::{primitive_edit::CaretRemoveMode, MoveMode},
};
use input_tree::{
    direction::{Direction, VerticalDirection},
    focus::{MinimalInputRowPosition, MinimalInputRowRange},
    node::InputNode,
};
use parser::{autocomplete::AutocompleteRule, parser::ParserBuilder};
use serde::{Deserialize, Serialize};
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
            editor: MathEditor::new(Arc::new(ParserBuilder::new().add_default_rules().build())),
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

    pub fn remove_at_caret(&mut self, remove_mode: CaretRemoveMode, move_mode: MoveMode) -> bool {
        self.editor
            .remove_at_caret(remove_mode, move_mode)
            .is_some()
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
    pub fn open_autocomplete(&mut self) -> bool {
        self.editor.open_autocomplete().is_some()
    }
    pub fn finish_autocomplete(&mut self, accept: bool) -> bool {
        self.editor.finish_autocomplete(accept).is_some()
    }
    pub fn move_in_autocomplete(&mut self, direction: VerticalDirection) -> bool {
        self.editor.move_in_autocomplete(direction).is_some()
    }
    pub fn get_autocomplete(&mut self) -> Result<JsValue, JsValue> {
        let autocomplete: Option<AutocompleteResultsBindings> = self
            .editor
            .get_autocomplete()
            .map(|autocomplete| autocomplete.into());

        let result = autocomplete.serialize(&self.serializer)?;
        Ok(result)
    }

    pub fn get_caret(&self) -> Result<JsValue, JsValue> {
        let result = self.editor.get_caret().serialize(&self.serializer)?;
        Ok(result)
    }

    pub fn get_syntax_tree(&mut self) -> Result<JsValue, JsValue> {
        let result = self.editor.get_syntax_tree().serialize(&self.serializer)?;
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

    pub fn get_rule_names(&self) -> Result<JsValue, JsValue> {
        let result = self.editor.get_rule_names().serialize(&self.serializer)?;
        Ok(result)
    }
}

impl<'a> From<AutocompleteResults<'a>> for AutocompleteResultsBindings {
    fn from(value: AutocompleteResults<'a>) -> Self {
        let (selected_index, matches, caret_position) = value.destructure();
        AutocompleteResultsBindings {
            selected_index,
            matches: matches
                .into_iter()
                .map(|rule_match| AutocompleteRuleMatchBindings {
                    rule: rule_match.rule.clone(),
                    rule_match_length: rule_match.rule_match_length,
                    input_match_length: rule_match.input_match_length,
                })
                .collect(),
            caret_position,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct AutocompleteResultsBindings {
    pub selected_index: usize,
    pub matches: Vec<AutocompleteRuleMatchBindings>,
    pub caret_position: MinimalInputRowPosition,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct AutocompleteRuleMatchBindings {
    pub rule: AutocompleteRule,
    /// How much of the rule value was matched, starting from the start.
    pub rule_match_length: usize,
    /// How much of the input was matched, starting from the end where the caret is and going backwards.
    /// Used for underlining the input.
    pub input_match_length: usize,
}
