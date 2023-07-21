use super::{InputFocusNode, InputFocusRow};
use crate::{
    grid::{Grid, Index2D},
    node::InputNode,
    row::{InputRow, RowIndices},
};
use std::sync::Arc;

/// A range in a grid, only stores the minimal amount of data
pub struct MinimalInputGridRange {
    pub row_indices: RowIndices,
    pub index: usize,
    pub start: Index2D,
    pub end: Index2D,
}

/// An inclusive range of positions in a grid
pub struct InputGridRange<'a> {
    pub grid_focus: Arc<InputFocusNode<'a>>,
    pub start: Index2D,
    pub end: Index2D,
}

impl<'a> InputGridRange<'a> {
    pub fn new(grid_focus: InputFocusNode<'a>, start: Index2D, end: Index2D) -> Self {
        let result = Self {
            grid_focus: Arc::new(grid_focus),
            start,
            end,
        };
        let grid = result.grid();
        assert!(start.x < grid.width());
        assert!(start.y < grid.height());
        assert!(end.x < grid.width());
        assert!(end.y < grid.height());
        result
    }

    pub fn top_left_index(&self) -> Index2D {
        Index2D {
            x: self.start.x.min(self.end.x),
            y: self.start.y.min(self.end.y),
        }
    }

    pub fn bottom_right_index(&self) -> Index2D {
        Index2D {
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
