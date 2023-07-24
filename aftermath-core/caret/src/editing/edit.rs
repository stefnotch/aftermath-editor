use input_tree::editing::BasicEdit;

use crate::caret::MinimalCaret;

pub struct CaretEdit {
    pub caret_before: MinimalCaret,
    pub caret_after: MinimalCaret,
    pub edits: Vec<BasicEdit>,
}
