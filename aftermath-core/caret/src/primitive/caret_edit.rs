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

impl From<CaretEdit> for UndoAction {
    fn from(val: CaretEdit) -> Self {
        UndoAction::CaretEdit(val)
    }
}
