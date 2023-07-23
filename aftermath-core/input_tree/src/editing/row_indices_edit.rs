use crate::{
    grid::Offset2D,
    row::{Offset, RowIndices},
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
        row_indices: &'a RowIndices,
        row_index_of_grid: usize,
        /// Must be on the edge of the grid.
        old_offset: Offset2D,
        /// Must be on the edge of the grid.
        new_offset: Offset2D,
    },
}
