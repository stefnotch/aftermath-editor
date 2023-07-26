use crate::{
    editing::{editable::Editable, BasicEdit, EditType, GridEdit, RowEdit},
    focus::{InputFocusRow, InputRowPosition, InputRowRange},
    grid::{Grid, GridDirection},
    row::{InputRow, Offset},
};

pub struct InputTree {
    pub root: InputRow,
}

impl InputTree {
    pub fn new(root: InputRow) -> Self {
        InputTree { root }
    }

    pub fn root_focus(&self) -> InputFocusRow {
        InputFocusRow::from_root(&self.root)
    }

    /// Creates a range that contains the positions. The positions do not have to be on the same row.
    pub fn range_from_positions<'a>(
        &'a self,
        start: &InputRowPosition<'a>,
        end: &InputRowPosition<'a>,
    ) -> InputRowRange<'a> {
        let shared = start.row_indices().get_shared(end.row_indices());

        // We need to know the direction of the selection to know whether the caret should be at the start or end of the row
        // We also have to handle edge cases like first caret is at top of fraction and second caret is at bottom of fraction
        let is_forwards = start <= end;

        let start_offset = start
            .row_indices()
            .at(shared.len())
            .map(|index| if is_forwards { index.0 } else { index.0 + 1 })
            .unwrap_or(start.offset.0);
        let end_offset = end
            .row_indices()
            .at(shared.len())
            .map(|index| if is_forwards { index.0 + 1 } else { index.0 })
            .unwrap_or(end.offset.0);
        InputRowRange::new(
            self.root_focus().walk_down_indices(&shared),
            Offset(start_offset),
            Offset(end_offset),
        )
    }
}

impl Editable for InputTree {
    fn apply_edit(&mut self, edit: &BasicEdit) {
        let row_indices = match edit {
            BasicEdit::Row(RowEdit { position, .. }) => &position.row_indices,
            BasicEdit::Grid(GridEdit {
                element_indices, ..
            }) => &element_indices.row_indices,
        };
        let mut row = &mut self.root;
        for index in row_indices.iter() {
            row = row
                .0
                .get_mut(index.0)
                .expect("Invalid row index")
                .row_mut(index.1);
        }

        match edit {
            BasicEdit::Row(RowEdit {
                edit_type: EditType::Insert,
                values,
                position,
            }) => {
                let start = position.offset.0;
                row.0.splice(start..start, values.iter().cloned());
            }
            BasicEdit::Row(RowEdit {
                edit_type: EditType::Delete,
                values,
                position,
            }) => {
                let start = position.offset.0;
                row.0
                    .splice(start..(start + values.len()), std::iter::empty());
            }
            BasicEdit::Grid(
                edit @ GridEdit {
                    edit_type,
                    element_indices,
                    direction,
                    offset,
                    values,
                },
            ) => {
                let node = row
                    .0
                    .get_mut(element_indices.index)
                    .expect("Invalid row index");
                assert!(node.has_resizable_grid());
                let grid = node.grid_mut().unwrap();
                let old_size = grid.size();
                let new_size = edit.new_grid_size(grid);
                let mut old_grid = std::mem::take(grid).into_iter();
                let mut new_grid = Vec::with_capacity(new_size.0 * new_size.1);

                match (edit_type, direction) {
                    (EditType::Insert, GridDirection::Row) => {
                        assert!(values.width() == old_size.0);
                        let insert_grid = values.values().iter().cloned();
                        new_grid.extend(old_grid.by_ref().take(values.width() * offset.0));
                        new_grid.extend(insert_grid);
                        new_grid.extend(old_grid);
                    }
                    (EditType::Insert, GridDirection::Column) => {
                        assert!(values.height() == old_size.1);
                        let mut insert_grid = values.values().iter().cloned();
                        for _ in 0..values.height() {
                            new_grid.extend(old_grid.by_ref().take(offset.0));
                            new_grid.extend(insert_grid.by_ref().take(values.width()));
                            new_grid.extend(old_grid.by_ref().take(old_size.0 - offset.0));
                        }
                    }
                    (EditType::Delete, GridDirection::Row) => {
                        assert!(values.width() == old_size.0);
                        new_grid.extend(old_grid.by_ref().take(values.width() * offset.0));
                        let _ = old_grid.by_ref().skip(values.values().len());
                        new_grid.extend(old_grid);
                    }
                    (EditType::Delete, GridDirection::Column) => {
                        assert!(values.height() == old_size.1);
                        for _ in 0..values.height() {
                            new_grid.extend(old_grid.by_ref().take(offset.0));
                            let _ = old_grid.by_ref().skip(values.width());
                            new_grid.extend(old_grid.by_ref().take(old_size.0 - offset.0));
                        }
                    }
                }
                *grid = Grid::from_one_dimensional(new_grid, new_size.0);

                assert!(grid.width() == new_size.0);
                assert!(grid.height() == new_size.1);
            }
        }
    }
}

impl Default for InputTree {
    fn default() -> Self {
        Self::new(InputRow::default())
    }
}
