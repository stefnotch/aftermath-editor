use input_tree::editing::{invertible::Invertible, BasicEdit};

use crate::caret::MinimalCaret;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UndoAction {
    CaretEdit(CaretEdit),
}

impl Invertible for UndoAction {
    type Inverse = Self;

    fn inverse(&self) -> Self::Inverse {
        match self {
            UndoAction::CaretEdit(caret_edit) => UndoAction::CaretEdit(caret_edit.inverse()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaretEdit {
    pub caret_before: MinimalCaret,
    pub caret_after: MinimalCaret,
    pub edits: Vec<BasicEdit>,
}

impl CaretEdit {
    pub fn is_empty(&self) -> bool {
        self.edits.is_empty()
    }
}

impl Invertible for CaretEdit {
    type Inverse = Self;

    fn inverse(&self) -> Self::Inverse {
        CaretEdit {
            caret_before: self.caret_after.clone(),
            caret_after: self.caret_before.clone(),
            edits: self.edits.iter().rev().map(|edit| edit.inverse()).collect(),
        }
    }
}

impl Into<UndoAction> for CaretEdit {
    fn into(self) -> UndoAction {
        UndoAction::CaretEdit(self)
    }
}

pub struct CaretEditBuilder {
    pub caret_before: MinimalCaret,
    pub edits: Vec<BasicEdit>,
}

impl CaretEditBuilder {
    pub fn new(caret: MinimalCaret) -> Self {
        Self {
            caret_before: caret,
            edits: Vec::new(),
        }
    }

    pub fn add_edit(&mut self, edit: BasicEdit) {
        self.edits.push(edit);
    }

    pub fn add_edits(&mut self, edits: Vec<BasicEdit>) {
        self.edits.extend(edits);
    }

    pub fn finish(self, caret_after: MinimalCaret) -> CaretEdit {
        CaretEdit {
            caret_before: self.caret_before,
            caret_after,
            edits: self.edits,
        }
    }
}
