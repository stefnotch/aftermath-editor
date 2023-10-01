use crate::{
    grid::GridDirection,
    row::{ElementIndices, Offset, RowIndices},
};

pub enum RowIndicesEdit<'a> {
    /// Applied to rows, this edit will move nodes around within the same row.
    /// The nodes to the right are always the ones that are moved.
    RowIndexEdit {
        row_indices: &'a RowIndices,
        /// Old offset < new offset means that we are inserting nodes.
        /// New offset > old offset means that we are deleting nodes.
        old_offset: Offset,
        new_offset: Offset,
    },

    /// Applied to grids, will move rows around within the same grid.
    /// Can either move horizontally or vertically.
    GridIndexEdit {
        element_indices: &'a ElementIndices,
        direction: GridDirection,
        old_offset: Offset,
        new_offset: Offset,
    },
}

impl RowIndicesEdit<'_> {
    pub fn is_insert(&self) -> bool {
        match self {
            RowIndicesEdit::RowIndexEdit {
                old_offset,
                new_offset,
                ..
            }
            | RowIndicesEdit::GridIndexEdit {
                old_offset,
                new_offset,
                ..
            } => new_offset > old_offset,
        }
    }
}
