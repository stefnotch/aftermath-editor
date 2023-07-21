mod grid_range;
mod row_position;
mod row_range;

use crate::{
    node::InputNode,
    row::{InputRow, RowIndex, RowIndices},
};

pub use grid_range::*;
pub use row_position::*;
pub use row_range::*;

/**
 * A focus is a pointer to a node in a tree, with a reference to the parent node.
 * Inspired by red-green trees ( https://blog.yaakov.online/red-green-trees/ ) and zippers ( http://learnyouahaskell.com/zippers )
 */
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
        Some(InputFocusNode::new(&self.row.0[index], self, index))
    }

    pub fn len(&self) -> usize {
        self.row.len()
    }

    pub fn row_indices(&self) -> &RowIndices {
        &self.row_indices
    }
}

impl PartialEq for InputFocusRow<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.row_indices == other.row_indices
    }
}

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

    pub fn child_at(mut self, index: usize) -> Option<InputFocusRow<'a>> {
        match self.node {
            InputNode::Container(_, grid) => grid.get_by_index(index).map(|row| {
                // Take the row indices from the parent
                let mut indices = self.parent.row_indices;
                self.parent.row_indices = Default::default();
                indices.push(RowIndex(self.index_in_parent, index));
                InputFocusRow::new(row, Some(self), indices)
            }),
            InputNode::Symbol(_) => None,
        }
    }
}