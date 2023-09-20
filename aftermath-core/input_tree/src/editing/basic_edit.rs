use crate::{
    focus::{InputRowPosition, InputRowRange, MinimalInputRowPosition, MinimalInputRowRange},
    grid::{Grid, GridDirection, GridVec},
    node::InputNode,
    row::{ElementIndices, InputRow, Offset},
};

use super::{invertible::Invertible, row_indices_edit::RowIndicesEdit};

/// Useless note: A Vec<BasicEdit> together with the .concat() method forms an algebraic group.
/// It is associative, has an identity element ([]) and can be inverted.
///
/// When creating multiple disjoint edits, I recommend creating them bottom to top, right to left.
/// That way, one edit doesn't afftect the indices of the other edits.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BasicEdit {
    Row(RowEdit),
    Grid(GridEdit),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EditType {
    Delete,
    Insert,
}

impl Invertible for EditType {
    type Inverse = EditType;

    fn inverse(&self) -> Self::Inverse {
        match self {
            EditType::Delete => EditType::Insert,
            EditType::Insert => EditType::Delete,
        }
    }
}

impl BasicEdit {
    pub fn remove_range(range: &InputRowRange<'_>) -> (Vec<BasicEdit>, MinimalInputRowPosition) {
        (
            vec![BasicEdit::Row(RowEdit {
                edit_type: EditType::Delete,
                position: range.left_position().to_minimal(),
                values: range.values().to_vec(),
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
            vec![BasicEdit::Row(RowEdit {
                edit_type: EditType::Insert,
                position: position.to_minimal(),
                values,
            })],
            MinimalInputRowPosition {
                row_indices: position.row_indices().clone(),
                offset: end_offset,
            },
        )
    }

    /// Creates an edit that replaces a range, and returns the new range.
    pub fn replace_range(
        range: &InputRowRange<'_>,
        values: Vec<InputNode>,
    ) -> (Vec<BasicEdit>, MinimalInputRowRange) {
        let (mut edits, _) = BasicEdit::remove_range(&range);
        let (mut insert_edits, position) =
            BasicEdit::insert_at_position(&range.left_position(), values);
        edits.append(&mut insert_edits);
        assert!(&position.row_indices == range.row_indices());
        (
            edits,
            MinimalInputRowRange {
                row_indices: range.row_indices().clone(),
                start: range.left_offset(),
                end: position.offset,
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
pub struct RowEdit {
    pub edit_type: EditType,
    /// Inserts or deletes to the right of the position
    pub position: MinimalInputRowPosition,
    /// The values that were inserted, also used for undo.
    pub values: Vec<InputNode>,
}

impl RowEdit {
    pub fn get_row_indices_edit<'a>(&'a self) -> RowIndicesEdit<'a> {
        let mut old_offset = self.position.offset.clone();
        let mut new_offset = Offset(self.position.offset.0 + self.values.len());
        if self.edit_type == EditType::Delete {
            std::mem::swap(&mut old_offset, &mut new_offset);
        }
        RowIndicesEdit::RowIndexEdit {
            row_indices: &self.position.row_indices,
            old_offset,
            new_offset,
        }
    }
}

impl Into<BasicEdit> for RowEdit {
    fn into(self) -> BasicEdit {
        BasicEdit::Row(self)
    }
}

impl Invertible for RowEdit {
    type Inverse = RowEdit;

    fn inverse(&self) -> Self::Inverse {
        RowEdit {
            edit_type: self.edit_type.inverse(),
            ..self.clone()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GridEdit {
    pub edit_type: EditType,
    pub element_indices: ElementIndices,
    pub direction: GridDirection,
    pub row_or_column: Offset,
    /// Needs to have a size that matches the grid
    pub values: GridVec<InputRow>,
}

impl GridEdit {
    pub fn get_row_indices_edit<'a>(&'a self) -> RowIndicesEdit<'a> {
        let mut old_offset = self.row_or_column.clone();
        let mut new_offset = if self.direction == GridDirection::Column {
            Offset(self.row_or_column.0 + self.values.width())
        } else {
            Offset(self.row_or_column.0 + self.values.height())
        };
        if self.edit_type == EditType::Delete {
            std::mem::swap(&mut old_offset, &mut new_offset);
        }
        RowIndicesEdit::GridIndexEdit {
            element_indices: &self.element_indices,
            direction: self.direction.clone(),
            old_offset,
            new_offset,
        }
    }

    pub fn new_grid_size(&self, old_grid: &GridVec<InputRow>) -> (usize, usize) {
        match (self.edit_type, self.direction) {
            (EditType::Insert, GridDirection::Column) => {
                (old_grid.width() + self.values.width(), old_grid.height())
            }
            (EditType::Insert, GridDirection::Row) => {
                (old_grid.width(), old_grid.height() + self.values.height())
            }
            (EditType::Delete, GridDirection::Column) => {
                (old_grid.width() - self.values.width(), old_grid.height())
            }
            (EditType::Delete, GridDirection::Row) => {
                (old_grid.width(), old_grid.height() - self.values.height())
            }
        }
    }
}

impl Into<BasicEdit> for GridEdit {
    fn into(self) -> BasicEdit {
        BasicEdit::Grid(self)
    }
}

impl Invertible for GridEdit {
    type Inverse = GridEdit;

    fn inverse(&self) -> Self::Inverse {
        GridEdit {
            edit_type: self.edit_type.inverse(),
            ..self.clone()
        }
    }
}
