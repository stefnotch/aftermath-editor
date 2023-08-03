use input_tree::{
    focus::{
        InputGridRange, InputRowPosition, InputRowRange, MinimalInputGridRange,
        MinimalInputRowPosition, MinimalInputRowRange,
    },
    grid::Offset2D,
    input_tree::InputTree,
    row::Offset,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MinimalCaret {
    pub start_position: MinimalInputRowPosition,
    pub end_position: MinimalInputRowPosition,
}

impl Default for MinimalCaret {
    fn default() -> Self {
        let position = MinimalInputRowPosition {
            row_indices: Default::default(),
            offset: Offset(0),
        };
        Self {
            start_position: position.clone(),
            end_position: position,
        }
    }
}

pub struct Caret<'a> {
    tree: &'a InputTree,
    start_position: InputRowPosition<'a>,
    end_position: InputRowPosition<'a>,
    selection: CaretSelection<'a>,
}

impl<'a> Caret<'a> {
    pub fn new(
        tree: &'a InputTree,
        start: InputRowPosition<'a>,
        end: InputRowPosition<'a>,
    ) -> Self {
        let selection = CaretSelection::from_positions(tree, &start, &end);
        Caret {
            tree,
            start_position: start,
            end_position: end,
            selection,
        }
    }

    pub fn to_minimal(&self) -> MinimalCaret {
        MinimalCaret {
            start_position: self.start_position.to_minimal(),
            end_position: self.end_position.to_minimal(),
        }
    }

    pub fn from_minimal(tree: &'a InputTree, minimal: &MinimalCaret) -> Self {
        let start_position =
            InputRowPosition::from_minimal(tree.root_focus(), &minimal.start_position);
        let end_position = InputRowPosition::from_minimal(tree.root_focus(), &minimal.end_position);
        Self::new(tree, start_position, end_position)
    }

    pub fn start_position(&self) -> &InputRowPosition<'a> {
        &self.start_position
    }

    pub fn set_start_position(&mut self, position: InputRowPosition<'a>) {
        self.start_position = position;
        self.selection =
            CaretSelection::from_positions(self.tree, &self.start_position, &self.end_position);
    }

    pub fn end_position(&self) -> &InputRowPosition<'a> {
        &self.end_position
    }

    pub fn set_end_position(&mut self, position: InputRowPosition<'a>) {
        self.end_position = position;
        self.selection =
            CaretSelection::from_positions(self.tree, &self.start_position, &self.end_position);
    }

    pub fn selection(&self) -> &CaretSelection<'a> {
        &self.selection
    }

    pub fn into_selection(self) -> CaretSelection<'a> {
        self.selection
    }

    pub fn set_selection(&mut self, selection: InputRowRange<'a>) {
        self.start_position = selection.start_position();
        self.end_position = selection.end_position();
        self.selection =
            CaretSelection::from_positions(self.tree, &self.start_position, &self.end_position);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MinimalCaretSelection {
    Row(MinimalInputRowRange),
    Grid(MinimalInputGridRange),
}

pub enum CaretSelection<'a> {
    Row(InputRowRange<'a>),
    Grid(InputGridRange<'a>),
}

impl<'a> CaretSelection<'a> {
    pub fn to_minimal(&self) -> MinimalCaretSelection {
        match self {
            CaretSelection::Row(value) => MinimalCaretSelection::Row(value.to_minimal()),
            CaretSelection::Grid(value) => MinimalCaretSelection::Grid(value.to_minimal()),
        }
    }

    pub(crate) fn from_positions(
        tree: &'a InputTree,
        start: &InputRowPosition<'a>,
        end: &InputRowPosition<'a>,
    ) -> Self {
        let shared_range = tree.range_from_positions(start, end);
        let is_single_element = shared_range.left_offset().0 + 1 == shared_range.right_offset().0;
        if !is_single_element {
            return CaretSelection::Row(shared_range);
        }

        // Test for grid selection
        let selected_element = shared_range.row_focus.node_at(shared_range.left_offset().0);

        let is_grid_selected = selected_element.map(|node| node.has_resizable_grid()) == Some(true);
        if !is_grid_selected {
            return CaretSelection::Row(shared_range);
        }

        // It's possible that the grid was selected normally
        let start_row_index = start.row_indices().at(shared_range.row_indices().len());
        let end_row_index = end.row_indices().at(shared_range.row_indices().len());

        match (start_row_index, end_row_index) {
            (Some(start_row_index), Some(end_row_index)) => {
                assert!(start_row_index.0 == shared_range.left_offset().0);
                assert!(end_row_index.0 == shared_range.left_offset().0);

                let selected_node = shared_range.row_focus.child_at(start_row_index.0).unwrap();

                let selected_grid = selected_node.node().grid().unwrap();

                let start_index = selected_grid.index_to_xy(start_row_index.1);
                let end_index = selected_grid.index_to_xy(end_row_index.1);

                // Slightly expand the selection so that it includes the end indices
                CaretSelection::Grid(InputGridRange::new(
                    selected_node,
                    Offset2D {
                        x: Offset(if start_index.x < end_index.x {
                            start_index.x
                        } else {
                            start_index.x + 1
                        }),
                        y: Offset(if start_index.y < end_index.y {
                            start_index.y
                        } else {
                            start_index.y + 1
                        }),
                    },
                    Offset2D {
                        x: Offset(if start_index.x < end_index.x {
                            end_index.x + 1
                        } else {
                            end_index.x
                        }),
                        y: Offset(if start_index.y < end_index.y {
                            end_index.y + 1
                        } else {
                            end_index.y
                        }),
                    },
                ))
            }
            (_, _) => CaretSelection::Row(shared_range),
        }
    }
}
