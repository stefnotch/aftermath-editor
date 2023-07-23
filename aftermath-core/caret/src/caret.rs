use input_tree::focus::{InputGridRange, InputRowPosition, InputRowRange, MinimalInputRowPosition};

pub struct MinimalCaret {
    pub start_position: MinimalInputRowPosition,
    pub end_position: MinimalInputRowPosition,
}

pub struct Caret<'a> {
    pub start_position: InputRowPosition<'a>,
    pub end_position: InputRowPosition<'a>,
}

pub enum CaretSelection<'a> {
    Row(InputRowRange<'a>),
    Grid(InputGridRange<'a>),
}

impl<'a> Caret<'a> {}
