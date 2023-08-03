use caret::{math_editor::MathEditor, primitive::MoveMode};
use input_tree::direction::Direction;
use parser::parse_rules::ParserRules;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
pub struct MathEditorBindings {
    editor: MathEditor,
    serializer: serde_wasm_bindgen::Serializer,
}

#[wasm_bindgen]
impl MathEditorBindings {
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
}
