use input_tree::{
    focus::{InputRowPosition, InputRowRange, MinimalInputRowPosition},
    grid::Index2D,
    node::{InputNode, InputNodeVariant},
    row::Offset,
};

pub struct CaretMover {
    /// Used for vertical movement to keep the caret in the same x position on screen.
    /// Returns the caret position on screen.
    /// Can also be left empty, in which case the caret will be placed at the start or end of the row.
    ///
    /// See also https://github.com/stefnotch/aftermath-editor/issues/13
    pub get_caret_viewport_position: Option<Box<fn(MinimalInputRowPosition) -> (f64, f64)>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Direction {
    Left,
    Right,
    Up,
    Down,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HorizontalDirection {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VerticalDirection {
    Up,
    Down,
}

impl CaretMover {
    pub fn new() -> Self {
        CaretMover {
            get_caret_viewport_position: None,
        }
    }

    /// Returns the new caret position, or None if the caret was not moved.
    pub fn move_caret<'a>(
        &self,
        caret: InputRowRange<'a>,
        direction: Direction,
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
                .move_horizontal_into(&caret, HorizontalDirection::Left)
                .or_else(|| self.move_horizontal_beyond_edge(&caret, HorizontalDirection::Left)),
            Direction::Right => self
                .move_horizontal_into(&caret, HorizontalDirection::Right)
                .or_else(|| self.move_horizontal_beyond_edge(&caret, HorizontalDirection::Right)),
            Direction::Up => {
                self.move_vertical(&caret, VerticalDirection::Up, caret_viewport_position)
            }
            Direction::Down => {
                self.move_vertical(&caret, VerticalDirection::Down, caret_viewport_position)
            }
        }
    }

    fn move_vertical<'a>(
        &self,
        caret: &InputRowPosition<'a>,
        direction: VerticalDirection,
        caret_viewport_position: Option<(f64, f64)>,
    ) -> Option<InputRowPosition<'a>> {
        let parent = match caret.row_focus.clone().parent() {
            Some(parent) => parent,
            None => return None,
        };

        // Leaving subscript or superscript special cases
        match (parent.node(), direction) {
            (InputNode::Container(InputNodeVariant::Sub, _), VerticalDirection::Down)
            | (InputNode::Container(InputNodeVariant::Sup, _), VerticalDirection::Up) => {
                let offset = Offset(parent.index_in_parent());
                return Some(InputRowPosition::new(parent.parent(), offset));
            }
            _ => {}
        };

        // Grid movement
        let grid = match parent.node() {
            InputNode::Container(_, grid) => grid,
            _ => return None,
        };
        let xy = grid.index_to_xy(caret.row_focus.index_in_parent().unwrap());
        let new_xy = match direction {
            VerticalDirection::Up => Index2D {
                x: xy.x,
                y: xy.y - 1,
            },
            VerticalDirection::Down => Index2D {
                x: xy.x,
                y: xy.y + 1,
            },
        };

        let new_row = parent.clone().child_at(grid.xy_to_index(new_xy));
        match new_row {
            Some(new_row) => {
                // Moved up or down
                // TODO: if self.get_caret_viewport_position.is_some() && caret_viewport_position.is_some() { moveVerticalClosestPosition }
                let offset = if direction == VerticalDirection::Up {
                    Offset(new_row.len())
                } else {
                    Offset(0)
                };
                Some(InputRowPosition::new(new_row, offset))
            }
            None => {
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

    /* TODO: Make get_caret_viewport_position functional
        /**
     * Repeatedly move the caret towards the target position, until we're close enough.
     */
    function moveVerticalClosestPosition(
      newZipper: InputRowZipper,
      desiredXPosition: number,
      getCaretPosition: (layoutPosition: InputRowPosition) => [ViewportValue, ViewportValue]
    ) {
      // Not fully implemented: Attempt to keep x-screen position. This is not trivial, especially with cases where the top fraction has some nested elements
      // Also do walk into nested elements if possible.
      let offset: Offset = 0;
      while (true) {
        const caretX = getCaretPosition(new InputRowPosition(newZipper, offset))[0];
        const newOffset: Offset = offset + (caretX < desiredXPosition ? 1 : -1);
        if (!offsetInBounds(newZipper, newOffset)) break;

        const newCaretX = getCaretPosition(new InputRowPosition(newZipper, newOffset))[0];
        const isBetter = Math.abs(newCaretX - desiredXPosition) < Math.abs(caretX - desiredXPosition);

        if (isBetter) {
          // Update offset
          offset = newOffset;
        } else {
          // Try moving into a nested element: 0 is right, -1 is left
          const childZipper = newZipper.children[offset + (caretX < desiredXPosition ? 0 : -1)];
          assert(childZipper !== undefined);
          if (childZipper instanceof InputSymbolZipper) {
            break; // We can't go any further
          } else {
            // Needs to be implemented
          }
        }
      }
      return new InputRowPosition(newZipper, offset);
    }

    function offsetInBounds(zipper: InputRowZipper, offset: number) {
      return 0 <= offset && offset <= zipper.value.values.length;
    }
     */

    /// Checks if the caret is moving at the very edge of its container
    fn is_touching_edge(
        &self,
        position: &InputRowPosition,
        direction: HorizontalDirection,
    ) -> bool {
        match direction {
            HorizontalDirection::Left => position.offset.0 <= 0,
            HorizontalDirection::Right => position.offset.0 >= position.row_focus.len(),
        }
    }

    /// Move to the left or right, but always out of the current element, because we're at the very edge.
    /// Make sure to first check `self.isTouchingEdge(direction)` before calling this function.
    fn move_horizontal_beyond_edge<'a>(
        &self,
        caret: &InputRowPosition<'a>,
        direction: HorizontalDirection,
    ) -> Option<InputRowPosition<'a>> {
        let parent = match caret.row_focus.clone().parent() {
            Some(parent) => parent,
            None => return None,
        };

        let adjacent_index = caret.row_focus.index_in_parent().map(|v| {
            if direction == HorizontalDirection::Left {
                v - 1
            } else {
                v + 1
            }
        });
        let adjacent_child =
            adjacent_index.and_then(|adjacent_index| parent.clone().child_at(adjacent_index));
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
        let is_touching_edge = self.is_touching_edge(caret, direction);
        if is_touching_edge {
            return None;
        }

        let adjacent_child = caret
            .row_focus
            .clone()
            .child_at(if direction == HorizontalDirection::Left {
                caret.offset.0 - 1
            } else {
                caret.offset.0
            })
            .unwrap();

        match adjacent_child.node() {
            input_tree::node::InputNode::Container(_, grid) => {
                let adjacent_row = if direction == HorizontalDirection::Left {
                    adjacent_child.child_at(grid.values().len() - 1).unwrap()
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
