mod grid_range;
mod row_position;
mod row_range;

use crate::{
    direction::HorizontalDirection,
    grid::{Grid, Index2D},
    node::InputNode,
    row::{ElementIndices, InputRow, Offset, RowIndex, RowIndices},
};

pub use grid_range::*;
pub use row_position::*;
pub use row_range::*;

/// A focus is a pointer to a node in a tree, with a reference to the parent node.
/// Inspired by red-green trees ( https://blog.yaakov.online/red-green-trees/ ) and zippers ( http://learnyouahaskell.com/zippers )
///
/// Note that the "immutable tree with shared parts" optimisation is not implemented, and probably will never need to be implemented.
/// Instead we have a straightforward mutable tree.
#[derive(Clone, Debug)]
pub struct InputFocusRow<'a> {
    row: &'a InputRow,
    /// The parent of this row, if it exists.
    /// The row_indices of the grandparent will be empty, because they have been handed to this row.
    parent: Option<Box<InputFocusNode<'a>>>,
    row_indices: RowIndices,
}

impl<'a> InputFocusRow<'a> {
    pub fn new(
        row: &'a InputRow,
        parent: Option<InputFocusNode<'a>>,
        row_indices: RowIndices,
    ) -> Self {
        Self {
            row,
            parent: parent.map(Box::new),
            row_indices,
        }
    }

    pub fn from_root(row: &'a InputRow) -> Self {
        Self::new(row, None, Default::default())
    }

    pub fn walk_down_indices(self, indices: &RowIndices) -> Self {
        let mut current = self;
        for index in indices.iter() {
            current = current
                .child_at(index.0)
                .expect("Invalid row-node indices")
                .child_at(index.1)
                .expect("Invalid node-row indices");
        }
        current
    }

    pub fn parent(self) -> Option<InputFocusNode<'a>> {
        self.parent.map(|x| {
            let mut parent = *x;
            // Give the row indices back to the grandparent
            parent.parent.row_indices = self.row_indices;
            parent.parent.row_indices.pop();
            parent
        })
    }

    pub fn child_at(self, index: usize) -> Option<InputFocusNode<'a>> {
        if index >= self.row.len() {
            return None;
        }
        Some(InputFocusNode::new(&self.row.values[index], self, index))
    }

    pub fn row_at(self, row_index: impl Into<RowIndex>) -> Option<InputFocusRow<'a>> {
        let row_index = row_index.into();
        self.child_at(row_index.0)?.child_at(row_index.1).ok()
    }

    pub fn node_at(&self, index: usize) -> Option<&'a InputNode> {
        self.row.values.get(index)
    }

    pub fn row(&self) -> &'a InputRow {
        self.row
    }

    pub fn len(&self) -> usize {
        self.row.len()
    }

    pub fn is_empty(&self) -> bool {
        self.row.is_empty()
    }

    pub fn row_indices(&self) -> &RowIndices {
        &self.row_indices
    }

    pub fn index_in_parent(&self) -> Option<usize> {
        self.row_indices
            .at(self.row_indices.len() - 1)
            .map(|row_index| row_index.1)
    }

    pub fn offset_to_index(&self, offset: Offset, direction: HorizontalDirection) -> Option<usize> {
        self.row.offset_to_index(offset, direction)
    }
}

impl PartialEq for InputFocusRow<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.row_indices == other.row_indices
    }
}

impl Eq for InputFocusRow<'_> {}

#[derive(Clone, Debug)]
pub struct InputFocusNode<'a> {
    node: &'a InputNode,
    parent: InputFocusRow<'a>,
    index_in_parent: usize,
}

impl<'a> InputFocusNode<'a> {
    pub fn new(node: &'a InputNode, parent: InputFocusRow<'a>, index_in_parent: usize) -> Self {
        InputFocusNode {
            node,
            parent,
            index_in_parent,
        }
    }

    pub fn node(&self) -> &'a InputNode {
        self.node
    }

    pub fn parent(self) -> InputFocusRow<'a> {
        self.parent
    }

    /// Get the child at the given index, if it exists.
    /// Otherwise returns this focus, to avoid consuming it.
    pub fn child_at(mut self, index: usize) -> Result<InputFocusRow<'a>, Self> {
        match self.node {
            InputNode::Container(_, grid) => match grid.get(Index2D::from_index(index, grid)) {
                Some(row) => {
                    // Take the row indices from the parent
                    let mut indices = self.parent.row_indices;
                    self.parent.row_indices = Default::default();
                    indices.push(RowIndex(self.index_in_parent, index));
                    Ok(InputFocusRow::new(row, Some(self), indices))
                }
                None => Err(self),
            },
            InputNode::Symbol(_) => Err(self),
        }
    }

    pub fn element_indices(&self) -> ElementIndices {
        ElementIndices {
            row_indices: self.parent.row_indices.clone(),
            index: self.index_in_parent,
        }
    }

    pub fn index_in_parent(&self) -> usize {
        self.index_in_parent
    }
}

impl PartialEq for InputFocusNode<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.parent.row_indices == other.parent.row_indices
            && self.index_in_parent == other.index_in_parent
    }
}

impl Eq for InputFocusNode<'_> {}
