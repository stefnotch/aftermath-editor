use input_tree::{
    direction::{Direction, HorizontalDirection, VerticalDirection},
    focus::{InputRowPosition, InputRowRange, MinimalInputRowPosition},
    grid::{Grid, Index2D},
    node::{InputNode, InputNodeVariant},
    row::Offset,
};
use serde::{Deserialize, Serialize};

use crate::caret::{Caret, CaretSelection};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub enum MoveMode {
    Char,
    Word,
    Line,
}

pub struct NavigationSettings {
    /// Used for vertical movement to keep the caret in the same x position on screen.
    /// Returns the caret position on screen.
    /// Can also be left empty, in which case the caret will be placed at the start or end of the row.
    ///
    /// See also https://github.com/stefnotch/aftermath-editor/issues/13
    pub get_caret_viewport_position: Option<Box<fn(MinimalInputRowPosition) -> (f64, f64)>>,
}

impl Default for NavigationSettings {
    fn default() -> Self {
        Self::new()
    }
}

impl NavigationSettings {
    pub fn new() -> Self {
        NavigationSettings {
            get_caret_viewport_position: None,
        }
    }

    pub fn move_caret(&self, caret: &mut Caret<'_>, direction: Direction, mode: MoveMode) {
        let selection = caret.selection();
        match selection {
            CaretSelection::Row(row) => {
                if let Some(new_position) = self.move_caret_range(row.clone(), direction, mode) {
                    caret.set_selection((&new_position).into());
                }
            }
            CaretSelection::Grid(_) => (),
        }
    }

    /// Returns the new caret position, or None if the caret was not moved.
    pub fn move_caret_range<'a>(
        &self,
        caret: InputRowRange<'a>,
        direction: Direction,
        mode: MoveMode,
    ) -> Option<InputRowPosition<'a>> {
        let is_collapsed = caret.is_collapsed();
        let caret = match direction {
            Direction::Left | Direction::Up => caret.left_position(),
            Direction::Right | Direction::Down => caret.right_position(),
        };
        let caret_viewport_position = self
            .get_caret_viewport_position
            .as_ref()
            .map(|f| f(caret.to_minimal()));

        if mode != MoveMode::Char {
            // TODO: Use MoveMode
            todo!();
        }
        let new_caret = self.move_caret_internal(&caret, direction, caret_viewport_position);
        match new_caret {
            Some(new_caret) => Some(new_caret),
            None => {
                // Collapsing the caret counts as a movement
                if !is_collapsed {
                    Some(caret)
                } else {
                    None
                }
            }
        }
    }

    /// Returns a new caret that has been moved in a given direction. Returns None if the caret cannot be moved in that direction.
    fn move_caret_internal<'a>(
        &self,
        caret: &InputRowPosition<'a>,
        direction: Direction,
        caret_viewport_position: Option<(f64, f64)>,
    ) -> Option<InputRowPosition<'a>> {
        match direction {
            Direction::Left => self
                .move_horizontal_into(caret, HorizontalDirection::Left)
                .or_else(|| self.move_horizontal_beyond_edge(caret, HorizontalDirection::Left)),
            Direction::Right => self
                .move_horizontal_into(caret, HorizontalDirection::Right)
                .or_else(|| self.move_horizontal_beyond_edge(caret, HorizontalDirection::Right)),
            Direction::Up => {
                self.move_vertical(caret, VerticalDirection::Up, caret_viewport_position)
            }
            Direction::Down => {
                self.move_vertical(caret, VerticalDirection::Down, caret_viewport_position)
            }
        }
    }

    fn move_vertical<'a>(
        &self,
        caret: &InputRowPosition<'a>,
        direction: VerticalDirection,
        caret_viewport_position: Option<(f64, f64)>,
    ) -> Option<InputRowPosition<'a>> {
        let parent = caret.row_focus.clone().parent()?;

        // Leaving subscript or superscript special cases
        match (parent.node(), direction) {
            (InputNode::Container(InputNodeVariant::Sub, _), VerticalDirection::Down)
            | (InputNode::Container(InputNodeVariant::Sup, _), VerticalDirection::Up) => {
                let offset = Offset(parent.index_in_parent());
                return Some(InputRowPosition::new(parent.parent(), offset));
            }
            _ => {}
        };

        // TODO: subsup supsub special cases
        // When I'm in the top sup of a \sum^_, then pressing down should move me to the bottom sup.

        // Grid movement
        let grid = match parent.node() {
            InputNode::Container(_, grid) => grid,
            _ => return None,
        };
        let xy = Index2D::from_index(caret.row_focus.index_in_parent()?, grid);
        let new_xy = match direction {
            VerticalDirection::Up => xy.sub_checked((0, 1), grid),
            VerticalDirection::Down => xy.add_checked((0, 1), grid),
        };
        let new_row = match new_xy {
            Some(new_xy) => parent.child_at(new_xy.to_index()),
            None => Err(parent),
        };
        match new_row {
            Ok(new_row) => {
                // Moved up or down
                // TODO: if self.get_caret_viewport_position.is_some() && caret_viewport_position.is_some() {
                // Get the caret position that is closest to where it was
                // but constrain it to be somewhere in the new_row.
                // We already have most of the logic in the renderer.
                // }
                let offset = if direction == VerticalDirection::Up {
                    Offset(new_row.len())
                } else {
                    Offset(0)
                };
                Some(InputRowPosition::new(new_row, offset))
            }
            Err(parent) => {
                // Reached the top/bottom
                let grandparent = parent.parent();
                self.move_vertical(
                    &InputRowPosition::new(grandparent, Offset(0)),
                    direction,
                    caret_viewport_position,
                )
            }
        }
    }

    /// Move to the left or right, but always out of the current element, because we're at the very edge.
    /// Make sure to first check `self.isTouchingEdge(direction)` before calling this function.
    fn move_horizontal_beyond_edge<'a>(
        &self,
        caret: &InputRowPosition<'a>,
        direction: HorizontalDirection,
    ) -> Option<InputRowPosition<'a>> {
        let parent = caret.row_focus.clone().parent()?;

        let adjacent_index = caret.row_focus.index_in_parent().map(|v| {
            if direction == HorizontalDirection::Left {
                v - 1
            } else {
                v + 1
            }
        });
        let adjacent_child =
            adjacent_index.and_then(|adjacent_index| parent.clone().child_at(adjacent_index).ok());
        if let Some(adjacent_child) = adjacent_child {
            // We're in the middle of the table or fraction
            let offset = if direction == HorizontalDirection::Left {
                Offset(adjacent_child.len())
            } else {
                Offset(0)
            };
            return Some(InputRowPosition::new(adjacent_child, offset));
        }

        // We're at the very edge of the element, so we'll try to move to the parent
        let offset = if direction == HorizontalDirection::Left {
            Offset(parent.index_in_parent())
        } else {
            Offset(parent.index_in_parent() + 1)
        };
        let grandparent = parent.parent();
        Some(InputRowPosition::new(grandparent, offset))
    }

    /// Move to the left or right, but always attempt to move into a nested element if there is one.
    fn move_horizontal_into<'a>(
        &self,
        caret: &InputRowPosition<'a>,
        direction: HorizontalDirection,
    ) -> Option<InputRowPosition<'a>> {
        let adjacent_index = caret.row_focus.offset_to_index(caret.offset, direction)?;

        let adjacent_child = caret.row_focus.clone().child_at(adjacent_index).unwrap();

        match adjacent_child.node() {
            input_tree::node::InputNode::Container(_, grid) => {
                let adjacent_row = if direction == HorizontalDirection::Left {
                    adjacent_child
                        .child_at(grid.width() * grid.height() - 1)
                        .unwrap()
                } else {
                    adjacent_child.child_at(0).unwrap()
                };
                let offset = if direction == HorizontalDirection::Left {
                    Offset(adjacent_row.len())
                } else {
                    Offset(0)
                };
                Some(InputRowPosition::new(adjacent_row, offset))
            }
            input_tree::node::InputNode::Symbol(_) => Some(InputRowPosition::new(
                caret.row_focus.clone(),
                if direction == HorizontalDirection::Left {
                    Offset(caret.offset.0 - 1)
                } else {
                    Offset(caret.offset.0 + 1)
                },
            )),
        }
    }
}
