use crate::caret::{CaretSelection, MinimalCaretSelection};
use crate::primitive::primitive_edit::{insert_at_range, remove_at_caret, CaretRemoveMode};
use crate::primitive::{CaretEditBuilder, CaretMover, MoveMode};
use crate::{
    caret::{Caret, MinimalCaret},
    primitive::UndoAction,
    undo_redo_manager::UndoRedoManager,
};
use input_tree::editing::editable::Editable;
use input_tree::editing::BasicEdit;
use input_tree::focus::InputRowRange;
use input_tree::input_tree::InputTree;
use input_tree::row::Offset;
use input_tree::{
    direction::{Direction, VerticalDirection},
    focus::{MinimalInputRowPosition, MinimalInputRowRange},
    node::InputNode,
};
use parser::{parse_rules::ParserRules, ParseResult, SyntaxNode};
use parser::{AutocompleteRuleMatch, ParseError};

pub enum SerializedDataType {
    JsonInputTree,
}

#[cfg_attr(feature = "wasm", wasm_bindgen::prelude::wasm_bindgen)]
pub struct MathEditor {
    /// User input
    input: InputTree,
    // TODO: maybe share parser rules in the future? (when we have multiple math editors)
    parser: ParserRules<'static>,
    /// Parsed content, can be cleared
    parsed: Option<ParseResult<SyntaxNode>>,
    /// Main caret
    caret: MinimalCaret,
    /// Undo-redo stack, will record actual edits
    undo_stack: UndoRedoManager<UndoAction>,
    caret_mover: CaretMover,
}

impl MathEditor {
    pub fn new(parser: ParserRules<'static>) -> Self {
        let input: InputTree = Default::default();
        Self {
            input,
            parser,
            parsed: None,
            caret: Default::default(),
            undo_stack: UndoRedoManager::new(),
            caret_mover: CaretMover::new(),
        }
    }
}

#[cfg_attr(feature = "wasm", wasm_bindgen::prelude::wasm_bindgen)]
impl MathEditor {
    /// Focus the editor, can be triggered with the tab key
    pub fn focus(&mut self) {
        // Do nothing for now
    }
    pub fn unfocus(&mut self) {
        // Do nothing for now
    }
    pub fn move_caret(&mut self, direction: Direction, mode: MoveMode) {
        let mut caret = Caret::from_minimal(&self.input, &self.caret);
        self.caret_mover.move_caret(&mut caret, direction, mode);
        self.caret = caret.to_minimal();
    }
}

impl MathEditor {
    pub fn select_with_caret(&mut self, direction: Direction, mode: MoveMode) -> Option<()> {
        let selection = Caret::from_minimal(&self.input, &self.caret).into_selection();
        match selection {
            CaretSelection::Row(range) => {
                let new_end = self.caret_mover.move_caret_range(
                    (&range.end_position()).into(),
                    direction,
                    mode,
                )?;
                self.caret.end_position = new_end.to_minimal();
            }
            CaretSelection::Grid(_) => {
                // Grid selection changing needs to be implemented
                todo!()
            }
        }
        Some(())
    }
    pub fn remove_at_caret(&mut self, mode: CaretRemoveMode) -> Option<()> {
        let selection = Caret::from_minimal(&self.input, &self.caret).into_selection();
        let mut builder = CaretEditBuilder::new(self.caret.clone());
        let new_caret = match selection {
            CaretSelection::Row(range) => {
                let (basic_edit, new_position) = remove_at_caret(&self.caret_mover, &range, mode)?;
                self.input.apply_edits(&basic_edit);
                builder.add_edits(basic_edit);
                MinimalCaret {
                    start_position: new_position.clone(),
                    end_position: new_position,
                }
            }
            CaretSelection::Grid(range) => {
                // Grid deleting needs to be implemented
                todo!();
            }
        };
        self.caret = new_caret.clone();
        self.undo_stack.push(builder.finish(new_caret).into());
        Some(())
    }
    /// Can also accept a \n and other special characters
    /// For example, when the user presses enter, we can insert a new row (table)
    pub fn insert_at_caret(&mut self, values: Vec<String>) -> Option<()> {
        self.insert_nodes_at_caret(values.into_iter().map(InputNode::Symbol).collect())
    }
    pub fn insert_nodes_at_caret(&mut self, values: Vec<InputNode>) -> Option<()> {
        let selection = Caret::from_minimal(&self.input, &self.caret).into_selection();
        let mut builder = CaretEditBuilder::new(self.caret.clone());
        let new_caret = match selection {
            CaretSelection::Row(range) => {
                let (basic_edit, new_position) = insert_at_range(&range, values)?;
                self.input.apply_edits(&basic_edit);
                builder.add_edits(basic_edit);
                MinimalCaret {
                    start_position: new_position.clone(),
                    end_position: new_position,
                }
            }
            CaretSelection::Grid(range) => {
                // Grid inserting needs to be implemented
                todo!();
            }
        };
        self.caret = new_caret.clone();
        self.undo_stack.push(builder.finish(new_caret).into());
        Some(())
    }
    pub fn select_all(&mut self) {
        self.caret = MinimalCaret {
            start_position: MinimalInputRowPosition {
                row_indices: Default::default(),
                offset: Offset(0),
            },
            end_position: MinimalInputRowPosition {
                row_indices: Default::default(),
                offset: Offset(self.input.root.len()),
            },
        }
    }
    pub fn undo(&mut self) -> Option<()> {
        let action = self.undo_stack.undo()?;
        self.apply_action(action);
        Some(())
    }
    pub fn redo(&mut self) -> Option<()> {
        let action = self.undo_stack.redo()?;
        self.apply_action(action);
        Some(())
    }
    fn apply_action(&mut self, action: UndoAction) {
        match action {
            UndoAction::CaretEdit(caret_edit) => {
                self.caret = caret_edit.caret_after;
                self.input.apply_edits(&caret_edit.edits);
            }
        }
    }

    pub fn start_selection(&mut self, position: MinimalInputRowPosition, mode: MoveMode) {
        todo!()
    }
    pub fn update_selection(&mut self, position: MinimalInputRowPosition) {
        todo!()
    }
    pub fn finish_selection(&mut self, position: MinimalInputRowPosition) {
        todo!()
    }

    pub fn copy(&mut self, data_type: SerializedDataType) -> String {
        let selection = Caret::from_minimal(&self.input, &self.caret).into_selection();
        let selected_nodes = match &selection {
            CaretSelection::Row(range) => range.values().collect::<Vec<_>>(),
            CaretSelection::Grid(range) => {
                // Grid copying needs to be implemented
                // For example, we could construct a new, smaller grid and copy that node
                todo!()
            }
        };
        // TODO: We should encode the format+version into the data
        match data_type {
            SerializedDataType::JsonInputTree => serde_json::to_string(&selected_nodes).unwrap(),
        }
    }
    pub fn paste(&mut self, data: String, data_type: Option<SerializedDataType>) -> Option<()> {
        let parsed = match data_type {
            Some(SerializedDataType::JsonInputTree) => serde_json::from_str(&data).ok()?,
            None => {
                // Auto-detect the data type
                todo!();
            }
        };
        self.insert_nodes_at_caret(parsed);
        Some(())
    }

    pub fn open_autocomplete(&mut self) {
        todo!()
    }
    pub fn apply_autocomplete(&mut self, accept: bool) {
        todo!()
    }
    pub fn move_in_autocomplete(&mut self, direction: VerticalDirection) {
        todo!()
    }

    pub fn get_autocomplete<'a>(&'a mut self) -> Option<Vec<AutocompleteRuleMatch<'a>>> {
        todo!()
    }
    pub fn get_syntax_tree(&mut self) -> &SyntaxNode {
        &self.get_parsed().value
    }
    pub fn get_parse_errors(&mut self) -> &[ParseError] {
        &self.get_parsed().errors
    }
    pub fn get_caret(&self) -> Vec<MinimalCaretSelection> {
        let selection = Caret::from_minimal(&self.input, &self.caret).into_selection();
        vec![selection.to_minimal()]
    }
    fn get_parsed(&mut self) -> &ParseResult<SyntaxNode> {
        if let Some(ref result) = (self).parsed {
            return result;
        }

        let parsed = parser::parse_row(&self.input.root, &self.parser);
        self.parsed = Some(parsed);
        self.parsed.as_ref().unwrap()
    }

    /// For setting some parsed MathML, or for inserting a result
    /// We have access to the syntax tree, so we know what sensible ranges are (e.g. "range after equals sign" or "range of root node")
    pub fn splice_at_range(&mut self, range: MinimalInputRowRange, values: Vec<InputNode>) {
        // Steps are:
        // Construct an edit
        // Move caret
        // Apply edit
        // Merge edit into undo stack
        let mut caret = self.caret.clone();
        let mut builder = CaretEditBuilder::new(self.caret.clone());
        let (basic_edit, _) = BasicEdit::replace_range(
            &InputRowRange::from_minimal(self.input.root_focus(), &range),
            values,
        );
        caret.start_position.apply_edits(&basic_edit);
        caret.end_position.apply_edits(&basic_edit);
        self.input.apply_edits(&basic_edit);
        builder.add_edits(basic_edit);
        self.undo_stack.push(builder.finish(caret).into());
    }
}