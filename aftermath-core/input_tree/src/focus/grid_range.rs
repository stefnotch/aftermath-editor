use super::{InputFocusNode, InputFocusRow};
use crate::{
    editing::editable::Editable,
    grid::{Grid, Offset2D},
    node::InputNode,
    row::{InputRow, RowIndices},
};
use std::sync::Arc;

/// A range in a grid, only stores the minimal amount of data
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MinimalInputGridRange {
    pub row_indices: RowIndices,
    pub index: usize,
    pub start: Offset2D,
    pub end: Offset2D,
}

/// An inclusive range of positions in a grid. Imagine a box.
#[derive(Clone, PartialEq, Eq)]
pub struct InputGridRange<'a> {
    pub grid_focus: Arc<InputFocusNode<'a>>,
    pub start: Offset2D,
    pub end: Offset2D,
}

impl<'a> InputGridRange<'a> {
    pub fn new(grid_focus: InputFocusNode<'a>, start: Offset2D, end: Offset2D) -> Self {
        let result = Self {
            grid_focus: Arc::new(grid_focus),
            start,
            end,
        };
        let grid = result.grid();
        assert!(start.x.0 <= grid.width());
        assert!(start.y.0 <= grid.height());
        assert!(end.x.0 <= grid.width());
        assert!(end.y.0 <= grid.height());
        result
    }

    pub fn top_left_index(&self) -> Offset2D {
        Offset2D {
            x: self.start.x.min(self.end.x),
            y: self.start.y.min(self.end.y),
        }
    }

    pub fn bottom_right_index(&self) -> Offset2D {
        Offset2D {
            x: self.start.x.max(self.end.x),
            y: self.start.y.max(self.end.y),
        }
    }

    pub fn is_collapsed(&self) -> bool {
        self.start == self.end
    }

    pub fn grid(&self) -> &Grid<InputRow> {
        match self.grid_focus.node() {
            InputNode::Container(_, grid) => grid,
            _ => panic!("Expected a grid"),
        }
    }

    pub fn get_row(&self, index: usize) -> Option<&InputRow> {
        self.grid().get_by_index(index)
    }

    pub fn to_minimal(&self) -> MinimalInputGridRange {
        MinimalInputGridRange {
            row_indices: self.grid_focus.parent.row_indices.clone(),
            index: self.grid_focus.index_in_parent,
            start: self.start,
            end: self.end,
        }
    }

    pub fn from_minimal(root: InputFocusRow<'a>, minimal: MinimalInputGridRange) -> Self {
        Self::new(
            root.walk_down_indices(&minimal.row_indices)
                .child_at(minimal.index)
                .unwrap(),
            minimal.start,
            minimal.end,
        )
    }
}

impl Editable for MinimalInputGridRange {
    fn apply_edit(&mut self, _edit: &crate::editing::BasicEdit) {
        todo!(); // TODO: Implement
    }
}
