use crate::{
    focus::{InputRowPosition, InputRowRange, MinimalInputGridRange, MinimalInputRowPosition},
    grid::Grid,
    node::InputNode,
    row::{InputRow, Offset},
};

use super::{invertible::Invertible, row_indices_edit::RowIndicesEdit};

/// Useless note: A Vec<BasicEdit> together with the .concat() method forms an algebraic group.
/// It is associative, has an identity element ([]) and can be inverted.
///
/// When creating multiple disjoint edits, I recommend creating them bottom to top, right to left.
/// That way, one edit doesn't afftect the indices of the other edits.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BasicEdit {
    Row(BasicRowEdit),
    Grid(BasicGridEdit),
}

impl BasicEdit {
    pub fn remove_range(range: &InputRowRange<'_>) -> (Vec<BasicEdit>, MinimalInputRowPosition) {
        (
            vec![BasicEdit::Row(BasicRowEdit::Delete {
                position: range.left_position().to_minimal(),
                values: range.values().cloned().collect(),
            })],
            MinimalInputRowPosition {
                row_indices: range.row_indices().clone(),
                offset: range.left_offset(),
            },
        )
    }

    pub fn insert_at_position(
        position: &InputRowPosition<'_>,
        values: Vec<InputNode>,
    ) -> (Vec<BasicEdit>, MinimalInputRowPosition) {
        let end_offset = Offset(position.offset.0 + values.len());
        (
            vec![BasicEdit::Row(BasicRowEdit::Insert {
                position: position.to_minimal(),
                values,
            })],
            MinimalInputRowPosition {
                row_indices: position.row_indices().clone(),
                offset: end_offset,
            },
        )
    }

    pub fn get_row_indices_edit<'a>(&'a self) -> RowIndicesEdit<'a> {
        match self {
            BasicEdit::Row(edit) => edit.get_row_indices_edit(),
            BasicEdit::Grid(edit) => edit.get_row_indices_edit(),
        }
    }
}

impl Invertible for BasicEdit {
    type Inverse = BasicEdit;
    fn inverse(&self) -> Self::Inverse {
        match self {
            BasicEdit::Row(edit) => BasicEdit::Row(edit.inverse()),
            BasicEdit::Grid(edit) => BasicEdit::Grid(edit.inverse()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BasicRowEdit {
    Insert {
        position: MinimalInputRowPosition,
        values: Vec<InputNode>,
    },
    Delete {
        /// Deletes to the right of the position
        position: MinimalInputRowPosition,
        /// The values that were removed, used for undo.
        values: Vec<InputNode>,
    },
}

impl BasicRowEdit {
    pub fn get_row_indices_edit<'a>(&'a self) -> RowIndicesEdit<'a> {
        match self {
            BasicRowEdit::Insert { position, values } => RowIndicesEdit::RowIndexEdit {
                row_indices: &position.row_indices,
                old_offset: position.offset.clone(),
                new_offset: Offset(position.offset.0 + values.len()),
            },
            BasicRowEdit::Delete { position, values } => RowIndicesEdit::RowIndexEdit {
                row_indices: &position.row_indices,
                old_offset: Offset(position.offset.0 + values.len()),
                new_offset: position.offset.clone(),
            },
        }
    }
}

impl Into<BasicEdit> for BasicRowEdit {
    fn into(self) -> BasicEdit {
        BasicEdit::Row(self)
    }
}

impl Invertible for BasicRowEdit {
    type Inverse = BasicRowEdit;

    fn inverse(&self) -> Self::Inverse {
        match self {
            BasicRowEdit::Insert { position, values } => BasicRowEdit::Delete {
                position: position.clone(),
                values: values.clone(),
            },
            BasicRowEdit::Delete { position, values } => BasicRowEdit::Insert {
                position: position.clone(),
                values: values.clone(),
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BasicGridEdit {
    Insert {
        /// Needs to be a collapsed range at an edge of the grid.
        position: MinimalInputGridRange,
        /// Needs to have a size that matches the grid
        values: Grid<InputRow>,
    },
    Delete {
        /// Needs to be a collapsed range at an edge of the grid.
        position: MinimalInputGridRange,
        /// Needs to have a size that matches the grid
        values: Grid<InputRow>,
    },
}

impl BasicGridEdit {
    pub fn get_row_indices_edit<'a>(&'a self) -> RowIndicesEdit<'a> {
        match self {
            BasicGridEdit::Insert { position, .. } => RowIndicesEdit::GridIndexEdit {
                row_indices: &position.row_indices,
                row_index_of_grid: position.index,
                old_offset: position.start.clone(),
                new_offset: position.end.clone(),
            },
            BasicGridEdit::Delete { position, .. } => RowIndicesEdit::GridIndexEdit {
                row_indices: &position.row_indices,
                row_index_of_grid: position.index,
                old_offset: position.end.clone(),
                new_offset: position.start.clone(),
            },
        }
    }

    pub fn is_row_edit(&self) -> bool {
        match self {
            BasicGridEdit::Insert { values, .. } => values.height() == 1,
            BasicGridEdit::Delete { values, .. } => values.height() == 1,
        }
    }

    pub fn new_grid_size(&self, old_grid: &Grid<InputRow>) -> (usize, usize) {
        match (self, self.is_row_edit()) {
            (BasicGridEdit::Insert { values, .. }, true) => {
                (old_grid.width(), old_grid.height() + values.height())
            }
            (BasicGridEdit::Insert { values, .. }, false) => {
                (old_grid.width() + values.width(), old_grid.height())
            }
            (BasicGridEdit::Delete { values, .. }, true) => {
                (old_grid.width(), old_grid.height() - values.height())
            }
            (BasicGridEdit::Delete { values, .. }, false) => {
                (old_grid.width() - values.width(), old_grid.height())
            }
        }
    }
}

impl Into<BasicEdit> for BasicGridEdit {
    fn into(self) -> BasicEdit {
        BasicEdit::Grid(self)
    }
}

impl Invertible for BasicGridEdit {
    type Inverse = BasicGridEdit;

    fn inverse(&self) -> Self::Inverse {
        match self {
            BasicGridEdit::Insert { position, values } => BasicGridEdit::Delete {
                position: position.clone(),
                values: values.clone(),
            },
            BasicGridEdit::Delete { position, values } => BasicGridEdit::Insert {
                position: position.clone(),
                values: values.clone(),
            },
        }
    }
}
