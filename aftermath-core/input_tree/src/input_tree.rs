use crate::{
    editing::{editable::Editable, BasicEdit, BasicGridEdit, BasicRowEdit},
    focus::{InputFocusRow, InputRowPosition, InputRowRange},
    grid::Grid,
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
            BasicEdit::Row(BasicRowEdit::Insert { position, .. }) => &position.row_indices,
            BasicEdit::Row(BasicRowEdit::Delete { position, .. }) => &position.row_indices,
            BasicEdit::Grid(BasicGridEdit::Insert { position, .. }) => &position.row_indices,
            BasicEdit::Grid(BasicGridEdit::Delete { position, .. }) => &position.row_indices,
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
            BasicEdit::Row(BasicRowEdit::Insert { values, position }) => {
                let start = position.offset.0;
                row.0.splice(start..start, values.iter().cloned());
            }
            BasicEdit::Row(BasicRowEdit::Delete { values, position }) => {
                let start = position.offset.0;
                row.0
                    .splice(start..(start + values.len()), std::iter::empty());
            }
            BasicEdit::Grid(BasicGridEdit::Insert { position, values }) => {
                assert!(position.start == position.end);
                let node = row.0.get_mut(position.index).expect("Invalid row index");
                assert!(node.has_resizable_grid());
                let grid = node.grid_mut().unwrap();
                let grid_width = grid.width();
                let new_size = (
                    grid.width() + values.width(),
                    grid.height() + values.height(),
                );
                let mut old_grid = std::mem::take(grid).into_iter();
                let mut insert_grid = values.values().iter().cloned();
                let mut new_grid = Vec::with_capacity(new_size.0 * new_size.1);
                for _ in 0..values.height() {
                    new_grid.extend(old_grid.by_ref().take(position.start.x.0));
                    new_grid.extend(insert_grid.by_ref().take(values.width()));
                    new_grid.extend(old_grid.by_ref().take(grid_width - position.start.x.0));
                }
                *grid = Grid::from_one_dimensional(new_grid, new_size.0);
            }
            BasicEdit::Grid(BasicGridEdit::Delete { position, values }) => {
                assert!(position.start == position.end);
                let node = row.0.get_mut(position.index).expect("Invalid row index");
                assert!(node.has_resizable_grid());
                let grid = node.grid_mut().unwrap();
                let grid_width = grid.width();
                let new_size = (
                    grid.width() - values.width(),
                    grid.height() - values.height(),
                );
                let mut old_grid = std::mem::take(grid).into_iter();
                let mut new_grid = Vec::with_capacity(new_size.0 * new_size.1);
                for _ in 0..values.height() {
                    new_grid.extend(old_grid.by_ref().take(position.start.x.0));
                    let _ = old_grid.by_ref().skip(values.width());
                    new_grid.extend(old_grid.by_ref().take(grid_width - position.start.x.0));
                }
                *grid = Grid::from_one_dimensional(new_grid, new_size.0);
            }
        }
    }
}

impl Default for InputTree {
    fn default() -> Self {
        Self::new(InputRow::default())
    }
}
