use input_tree::{
    direction::HorizontalDirection,
    editing::BasicEdit,
    focus::{InputRowPosition, InputRowRange, MinimalInputRowPosition},
    node::InputNode,
};

use super::CaretMover;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaretRemoveMode {
    Left,
    Right,
    /// The selected range is deleted, even if it's empty.
    Range,
}

// Should probably be moved elsewhere.
// The functions here return edit commands that needs to be applied to the tree.
impl CaretMover {
    pub fn insert_at_range(
        caret: &InputRowRange<'_>,
        values: Vec<InputNode>,
    ) -> Option<(Vec<BasicEdit>, MinimalInputRowPosition)> {
        // Caret specific logic
        if caret.is_collapsed() {
            Some(BasicEdit::insert_at_position(
                &caret.start_position(),
                values,
            ))
        } else {
            let (mut edits, _) = BasicEdit::remove_range(&caret);
            let (mut insert_edits, position) =
                BasicEdit::insert_at_position(&caret.left_position(), values);
            edits.append(&mut insert_edits);
            Some((edits, position))
        }
    }

    pub fn remove_at_caret(
        &self,
        caret: &InputRowRange<'_>,
        mode: CaretRemoveMode,
    ) -> Option<(Vec<BasicEdit>, MinimalInputRowPosition)> {
        if !caret.is_collapsed() {
            return Some(BasicEdit::remove_range(caret));
        }
        match mode {
            CaretRemoveMode::Left => {
                self.remove_at_caret_position(caret.start_position(), HorizontalDirection::Left)
            }
            CaretRemoveMode::Right => {
                self.remove_at_caret_position(caret.start_position(), HorizontalDirection::Right)
            }
            CaretRemoveMode::Range => Some(BasicEdit::remove_range(caret)),
        }
    }

    fn remove_at_caret_position(
        &self,
        caret: InputRowPosition<'_>,
        direction: HorizontalDirection,
    ) -> Option<(Vec<BasicEdit>, MinimalInputRowPosition)> {
        let adjacent_index = caret.row_focus.offset_to_index(caret.offset, direction);
    }
}
