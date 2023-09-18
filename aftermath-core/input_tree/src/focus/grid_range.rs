use serde::{Deserialize, Serialize};

use super::{InputFocusNode, InputFocusRow};
use crate::{
    editing::editable::Editable,
    grid::{Grid, GridRectangle, GridVec, Index2D},
    node::InputNode,
    row::{InputRow, RowIndices},
};
use std::sync::Arc;

/// A range in a grid, only stores the minimal amount of data
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct MinimalInputGridRange {
    pub row_indices: RowIndices,
    pub index: usize,
    pub range: GridRectangle,
}

/// An box-like selection.
#[derive(Clone, PartialEq, Eq)]
pub struct InputGridRange<'a> {
    pub grid_focus: Arc<InputFocusNode<'a>>,
    pub range: GridRectangle,
}

impl<'a> InputGridRange<'a> {
    pub fn new(grid_focus: InputFocusNode<'a>, range: GridRectangle) -> Self {
        Self {
            grid_focus: Arc::new(grid_focus),
            range,
        }
    }

    pub fn top_left_index(&self) -> (usize, usize) {
        self.range.start_index().into()
    }

    pub fn bottom_right_index(&self) -> Option<(usize, usize)> {
        self.range.end_index_inclusive().map(|v| v.into())
    }

    pub fn is_collapsed(&self) -> bool {
        self.range.is_empty()
    }

    pub fn grid(&self) -> &GridVec<InputRow> {
        match self.grid_focus.node() {
            InputNode::Container(_, grid) => grid,
            _ => panic!("Expected a grid"),
        }
    }

    pub fn get_row(&self, index: usize) -> Option<&InputRow> {
        self.grid().get(Index2D::from_index(index, self.grid()))
    }

    pub fn to_minimal(&self) -> MinimalInputGridRange {
        MinimalInputGridRange {
            row_indices: self.grid_focus.parent.row_indices.clone(),
            index: self.grid_focus.index_in_parent,
            range: self.range,
        }
    }

    pub fn from_minimal(root: InputFocusRow<'a>, minimal: &MinimalInputGridRange) -> Self {
        Self::new(
            root.walk_down_indices(&minimal.row_indices)
                .child_at(minimal.index)
                .unwrap(),
            minimal.range,
        )
    }
}

impl Editable for MinimalInputGridRange {
    fn apply_edit(&mut self, _edit: &crate::editing::BasicEdit) {
        todo!(); // TODO: Implement
    }
}
