use super::CaretMover;
use input_tree::{
    direction::HorizontalDirection,
    editing::BasicEdit,
    focus::{InputFocusNode, InputRowPosition, InputRowRange, MinimalInputRowPosition},
    node::{InputNode, InputNodeVariant},
    row::Offset,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaretRemoveMode {
    Left,
    Right,
    /// The selected range is deleted, even if it's empty.
    Range,
}

// The functions here return edit commands that needs to be applied to the tree.
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
    caret_mover: &CaretMover,
    caret: &InputRowRange<'_>,
    mode: CaretRemoveMode,
) -> Option<(Vec<BasicEdit>, MinimalInputRowPosition)> {
    if !caret.is_collapsed() {
        return Some(BasicEdit::remove_range(caret));
    }
    match mode {
        CaretRemoveMode::Left => remove_at_caret_position(
            caret_mover,
            caret.start_position(),
            HorizontalDirection::Left,
        ),
        CaretRemoveMode::Right => remove_at_caret_position(
            caret_mover,
            caret.start_position(),
            HorizontalDirection::Right,
        ),
        CaretRemoveMode::Range => Some(BasicEdit::remove_range(caret)),
    }
}

fn remove_at_caret_position(
    caret_mover: &CaretMover,
    caret: InputRowPosition<'_>,
    direction: HorizontalDirection,
) -> Option<(Vec<BasicEdit>, MinimalInputRowPosition)> {
    /// Nothing to delete, just move the caret
    fn move_caret(
        caret_mover: &CaretMover,
        caret: InputRowPosition<'_>,
        direction: HorizontalDirection,
    ) -> Option<(Vec<BasicEdit>, MinimalInputRowPosition)> {
        let position = caret_mover.move_caret((&caret).into(), direction.into())?;
        Some((vec![], position.to_minimal()))
    }

    /// Copy all children of the node, remove node, and insert the children at the caret position
    fn flatten_node(
        node_focus: InputFocusNode<'_>,
        offset_in_node: Offset,
    ) -> Option<(Vec<BasicEdit>, MinimalInputRowPosition)> {
        let values = node_focus
            .node()
            .grid()
            .expect("Expected a grid")
            .values()
            .iter()
            .flat_map(|row| row.0.iter().cloned())
            .collect();
        let node_index = node_focus.index_in_parent();
        let row = node_focus.parent();
        let range = InputRowRange::new(row, Offset(node_index), Offset(node_index + 1));
        let (mut edits, mut position) = BasicEdit::remove_range(&range);
        let (mut insert_edits, _) = BasicEdit::insert_at_position(&range.left_position(), values);
        edits.append(&mut insert_edits);
        position.offset = Offset(position.offset.0 + offset_in_node.0);
        Some((edits, position))
    }

    let adjacent_index = caret.row_focus.offset_to_index(caret.offset, direction);
    let adjacent_node =
        adjacent_index.and_then(|index| caret.row_focus.node_at(index).map(|node| (index, node)));

    // Delete symbol
    if let Some((index, InputNode::Symbol(_))) = adjacent_node {
        return Some(BasicEdit::remove_range(&InputRowRange::new(
            caret.row_focus,
            Offset(index),
            Offset(index + 1),
        )));
    }

    // Delete the superscript/subscript but keep its contents
    // cat|^3 becomes cat|3
    if let Some((index, InputNode::Container(InputNodeVariant::Sub | InputNodeVariant::Sup, _))) =
        adjacent_node
    {
        if direction == HorizontalDirection::Right {
            return flatten_node(caret.row_focus.child_at(index).unwrap(), Offset(0));
        }
    }

    // Move into next/previous node
    if let Some(_) = adjacent_node {
        return move_caret(caret_mover, caret, direction);
    }

    // At the start or end of a row, so we might delete an entire node
    let index_in_parent = caret.row_focus.index_in_parent();
    let parent = caret.row_focus.clone().parent()?;
    let index_in_parent = index_in_parent.unwrap();

    // Special cases
    match parent.node() {
        InputNode::Container(InputNodeVariant::Sub | InputNodeVariant::Sup, _) => {
            // Flatten superscript/subscript that we are at the start of
            if direction == HorizontalDirection::Left {
                return flatten_node(parent, Offset(0));
            }
        }
        InputNode::Container(InputNodeVariant::Fraction | InputNodeVariant::Root, grid) => {
            // Flatten fraction/root that we are in the middle of
            if (direction == HorizontalDirection::Left && index_in_parent == 1)
                || (direction == HorizontalDirection::Right && index_in_parent == 0)
            {
                return flatten_node(parent, Offset(grid.get_by_index(0).unwrap().len()));
            }
        }
        _ => {}
    };

    // General grid movement
    let grid = parent.node().grid()?;
    let at_edge = match direction {
        HorizontalDirection::Left => index_in_parent <= 0,
        HorizontalDirection::Right => index_in_parent >= grid.values().len() - 1,
    };
    if at_edge && grid.values().iter().all(|v| v.0.is_empty()) {
        // Delete the entire node if we are at the start/end *and* the grid is empty
        return flatten_node(parent, Offset(0));
    } else {
        // Move into next/previous node if we aren't at the start/end
        move_caret(caret_mover, caret, direction)
    }
}
