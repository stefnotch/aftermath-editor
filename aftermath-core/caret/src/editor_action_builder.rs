use std::ops::Deref;

use input_tree::editing::{editable::Editable, BasicEdit};

use crate::{caret::MinimalCaret, math_editor::MathEditor, primitive::CaretEdit};

/// Almost every function in the math editor delays the actual editing until the end of the function.
/// So this struct is used to build up the edits and then convert it into a CaretEdit at the end.
/// It also stores the parsed syntax tree so that it doesn't have to be reparsed every time.
#[must_use]
pub struct EditorActionBuilder<'editor> {
    editor: &'editor mut MathEditor,
    caret_before: MinimalCaret,
    edits: Vec<BasicEdit>,
}

impl<'editor> EditorActionBuilder<'editor> {
    pub fn new(editor: &'editor mut MathEditor) -> Self {
        let caret_before = editor.caret.clone();
        Self {
            editor,
            caret_before,
            edits: Vec::new(),
        }
    }

    pub fn add_edit(&mut self, edit: BasicEdit) {
        self.edits.push(edit);
    }

    pub fn add_edits(&mut self, edits: Vec<BasicEdit>) {
        self.edits.extend(edits);
    }

    pub fn discard(self) {
        // no-op
    }

    pub fn finish(self, caret_after: MinimalCaret) -> CaretEdit {
        let edit = CaretEdit {
            caret_before: self.caret_before,
            caret_after,
            edits: self.edits,
        };

        if !edit.edits.is_empty() {
            self.editor.input.apply_edits(&edit.edits);
            self.editor.parsed = None;
            self.editor.undo_stack.push(edit.clone().into());
        }
        self.editor.caret = edit.caret_after.clone();
        edit
    }
}

impl<'editor> Deref for EditorActionBuilder<'editor> {
    type Target = MathEditor;

    fn deref(&self) -> &Self::Target {
        self.editor
    }
}
