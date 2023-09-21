use std::sync::Arc;

use crate::autocomplete::{AutocompleteResults, AutocorrectAction, AutocorrectActionBuilder};
use crate::caret::{CaretSelection, MinimalCaretSelection};
use crate::editor_action_builder::EditorActionBuilder;
use crate::primitive::primitive_edit::{insert_at_range, remove_at_caret, CaretRemoveMode};
use crate::primitive::{CaretEdit, MoveMode, NavigationSettings};
use crate::{
    caret::{Caret, MinimalCaret},
    primitive::UndoAction,
    undo_redo_manager::UndoRedoManager,
};
use input_tree::editing::editable::Editable;
use input_tree::editing::BasicEdit;
use input_tree::focus::{InputRowPosition, InputRowRange};
use input_tree::input_tree::InputTree;
use input_tree::row::Offset;
use input_tree::{
    direction::{Direction, VerticalDirection},
    focus::{MinimalInputRowPosition, MinimalInputRowRange},
    node::InputNode,
};
use parser::autocomplete::{AutocompleteMatcher, AutocompleteRule, AutocompleteRuleMatch};
use parser::parser::MathParser;
use parser::syntax_tree::{NodeIdentifier, SyntaxNode};
use serialization::{deserialize_input_nodes, serialize_input_nodes};

pub use serialization::SerializedDataType;

#[cfg_attr(feature = "wasm", wasm_bindgen::prelude::wasm_bindgen)]
pub struct MathEditor {
    /// User input
    pub(crate) input: InputTree,
    pub(crate) parser: Arc<MathParser>,
    /// Parsed content, can be cleared
    pub(crate) parsed: Option<SyntaxNode>,
    /// Main caret
    pub(crate) caret: MinimalCaret,
    /// Selection mode, describes how the current selection works
    pub(crate) selection_mode: Option<MoveMode>,
    /// Keeps track of the autocomplete popup
    pub(crate) autocomplete_state: AutocompleteState,
    /// Undo-redo stack, will record actual edits
    pub(crate) undo_stack: UndoRedoManager<UndoAction>,
    pub(crate) caret_mover: NavigationSettings,
}

impl MathEditor {
    pub fn new(parser: Arc<MathParser>) -> Self {
        let input: InputTree = Default::default();
        Self {
            input,
            parser,
            parsed: None,
            caret: Default::default(),
            selection_mode: None,
            autocomplete_state: AutocompleteState::new(),
            undo_stack: UndoRedoManager::new(),
            caret_mover: NavigationSettings::new(),
        }
    }
}

impl MathEditor {
    /// Focus the editor, can be triggered with the tab key
    pub fn focus(&mut self) {
        // Do nothing for now
    }
    pub fn unfocus(&mut self) {
        // Do nothing for now
    }
    pub fn move_caret(&mut self, direction: Direction, mode: MoveMode) {
        let autocorrect = self.start_autocorrect();
        let builder = EditorActionBuilder::new(self);
        let mut caret = Caret::from_minimal(&builder.input, &builder.caret);
        builder.caret_mover.move_caret(&mut caret, direction, mode);
        let caret = caret.to_minimal();
        let action = builder.finish(caret);
        self.apply_autocorrect(autocorrect.finish(&action.edits));
    }
    pub fn select_with_caret(&mut self, direction: Direction, mode: MoveMode) -> Option<()> {
        let autocorrect = self.start_autocorrect();
        let mut builder = EditorActionBuilder::new(self);
        let selection = Caret::from_minimal(&builder.input, &builder.caret).into_selection();
        let caret = match selection {
            CaretSelection::Row(range) => {
                let new_end = builder.caret_mover.move_caret_range(
                    (&range.end_position()).into(),
                    direction,
                    mode,
                )?;
                MinimalCaret {
                    start_position: builder.caret.start_position.clone(),
                    end_position: new_end.to_minimal(),
                }
            }
            CaretSelection::Grid(_) => {
                // Grid selection changing needs to be implemented
                todo!()
            }
        };
        let action = builder.finish(caret);
        self.apply_autocorrect(autocorrect.finish(&action.edits));
        Some(())
    }
    pub fn remove_at_caret(
        &mut self,
        remove_mode: CaretRemoveMode,
        move_mode: MoveMode,
    ) -> Option<()> {
        let autocorrect = self.start_autocorrect();
        let mut builder = EditorActionBuilder::new(self);
        let selection = Caret::from_minimal(&builder.input, &builder.caret).into_selection();
        let new_caret = match selection {
            CaretSelection::Row(range) => {
                let (basic_edit, new_position) =
                    remove_at_caret(&builder.caret_mover, &range, remove_mode)?;
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

        let action = builder.finish(new_caret);
        self.apply_autocorrect(autocorrect.finish(&action.edits));
        Some(())
    }

    /// Can also accept a \n and other special characters
    /// For example, when the user presses enter, we can insert a new row (table)
    pub fn insert_at_caret(&mut self, values: Vec<String>) {
        let autocorrect = self.start_autocorrect();
        let action =
            self.insert_nodes_at_caret(values.into_iter().map(InputNode::Symbol).collect());
        if let Some(action) = action {
            self.apply_autocorrect(autocorrect.finish(&action.edits));
        }
    }
    fn insert_nodes_at_caret(&mut self, values: Vec<InputNode>) -> Option<CaretEdit> {
        let mut builder = EditorActionBuilder::new(self);
        let selection = Caret::from_minimal(&builder.input, &builder.caret).into_selection();
        let new_caret = match selection {
            CaretSelection::Row(range) => {
                let (basic_edit, new_position) = insert_at_range(&range, values)?;
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
        Some(builder.finish(new_caret))

        // TODO:
        // Forced autocorrect (ligatures anyone?)
        // - / fraction
        // - ^ exponent
        // - _ subscript
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
                self.parsed = None;
            }
        }
    }

    pub fn start_selection(&mut self, position: MinimalInputRowPosition, mode: MoveMode) {
        self.selection_mode = Some(mode);
        let autocorrect = self.start_autocorrect();
        let builder = EditorActionBuilder::new(self);
        // TODO: Use the mode. Kinda like
        // editor.caret_mover.move_mode_to_range(mode) // and then use that info to extend the selection
        let action = builder.finish(MinimalCaret {
            start_position: position.clone(),
            end_position: position,
        });
        self.apply_autocorrect(autocorrect.finish(&action.edits));
    }
    pub fn extend_selection(&mut self, position: MinimalInputRowPosition) {
        let mode = self.selection_mode.unwrap_or(MoveMode::Char);

        let autocorrect = self.start_autocorrect();
        let builder = EditorActionBuilder::new(self);
        // TODO: Use the mode. Kinda like
        // editor.caret_mover.move_mode_to_range(mode) // and then use that info to extend the selection

        let caret = MinimalCaret {
            start_position: builder.caret.start_position.clone(),
            end_position: position,
        };
        let action = builder.finish(caret);

        self.apply_autocorrect(autocorrect.finish(&action.edits));
    }
    pub fn finish_selection(&mut self) {
        self.selection_mode = None;
    }

    pub fn copy(
        &self,
        data_type: SerializedDataType,
    ) -> Result<String, serialization::SerializationError> {
        let selection = Caret::from_minimal(&self.input, &self.caret).into_selection();
        let selected_nodes = match &selection {
            CaretSelection::Row(range) => range.values(),
            CaretSelection::Grid(range) => {
                // Grid copying needs to be implemented
                // For example, we could construct a new, smaller grid and copy that node
                todo!()
            }
        };
        serialize_input_nodes(selected_nodes, data_type)
    }
    pub fn paste(
        &mut self,
        data: String,
        data_type: Option<SerializedDataType>,
    ) -> Result<(), serialization::SerializationError> {
        let autocorrect = self.start_autocorrect();
        let nodes = deserialize_input_nodes(data, data_type)?;
        let action = self.insert_nodes_at_caret(nodes);
        if let Some(action) = action {
            self.apply_autocorrect(autocorrect.finish(&action.edits));
        }
        Ok(())
    }

    pub fn open_autocomplete(&mut self) -> Option<()> {
        self.get_autocomplete().map(|_| ())
    }
    pub fn finish_autocomplete(&mut self, accept: bool) -> Option<()> {
        if !accept {
            return None;
        }
        let autocomplete = self.get_autocomplete()?;
        let selected_autocomplete = autocomplete.get_selected();
        let range = autocomplete.get_caret_range(selected_autocomplete);
        let values = selected_autocomplete.rule.result.to_vec();
        self.splice_at_range(range, values);
        Some(())
    }
    pub fn move_in_autocomplete(&mut self, direction: VerticalDirection) -> Option<()> {
        let mut autocomplete = self.get_autocomplete()?;
        autocomplete.move_selection(direction);
        let rule = autocomplete.get_selected().rule.clone();
        self.autocomplete_state.set_current_autocomplete(Some(rule));
        Some(())
    }

    fn start_autocorrect(&mut self) -> AutocorrectActionBuilder {
        self.get_autocomplete()
            .map(|v| v.start_autocorrect())
            .unwrap_or_default()
    }
    /// When the caret moves, we apply "perfect match" autocompletes
    fn apply_autocorrect(&mut self, autocorrect: Option<AutocorrectAction>) -> Option<()> {
        let autocorrect = autocorrect?;
        let caret_start_position =
            match Caret::from_minimal(&self.input, &self.caret).into_selection() {
                CaretSelection::Row(range) => Some(range.start_position()),
                CaretSelection::Grid(_) => None,
            }?;

        let autocomplete_range =
            InputRowRange::from_minimal(self.input.root_focus(), &autocorrect.caret_range);
        if autocomplete_range.contains(&caret_start_position) {
            // We're still editing the same token and just moved around in it. We don't have the "editing a different part of the tree" intent yet.
            return None;
        }

        // It might no longer be a perfect match, so we need to check again
        let is_perfect_match = autocorrect
            .rule
            .matches(
                autocomplete_range.values(),
                autocomplete_range.left_offset().0,
                1,
            )
            .iter()
            .any(|rule_match| rule_match.is_complete_match());

        if !is_perfect_match {
            return None;
        }

        self.splice_at_range(
            autocomplete_range.to_minimal(),
            autocorrect.rule.result.to_vec(),
        );
        return Some(());
    }

    pub fn get_autocomplete<'a>(&'a mut self) -> Option<AutocompleteResults<'a>> {
        let selection = Caret::from_minimal(&self.input, &self.caret).into_selection();
        let position = match selection {
            CaretSelection::Row(range) if range.is_collapsed() => range.start_position(),
            CaretSelection::Row(_) => return None,
            CaretSelection::Grid(_) => return None,
        };
        let matches = self
            .parser
            .matches(&position.row_focus.row().values, position.offset.0, 2);
        Some(
            self.autocomplete_state
                .get_autocomplete(matches, position.to_minimal()),
        )
    }
    pub fn get_caret(&self) -> Vec<MinimalCaretSelection> {
        let selection = Caret::from_minimal(&self.input, &self.caret).into_selection();
        vec![selection.to_minimal()]
    }
    pub fn get_syntax_tree(&mut self) -> &SyntaxNode {
        if let Some(ref result) = (self).parsed {
            return result;
        }

        let parsed = self.parser.parse(&self.input.root.values);
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
        let caret_before = self.caret.clone();
        let mut caret = self.caret.clone();
        let mut builder = EditorActionBuilder::new(self);
        let (basic_edit, _) = BasicEdit::replace_range(
            &InputRowRange::from_minimal(builder.input.root_focus(), &range),
            values,
        );
        caret.start_position.apply_edits(&basic_edit);
        caret.end_position.apply_edits(&basic_edit);
        builder.add_edits(basic_edit);
        builder.finish(caret);
        self.caret = caret_before;
    }

    /// Get all the known rule names
    pub fn get_rule_names(&self) -> Vec<NodeIdentifier> {
        let mut names: Vec<_> = self.parser.get_rule_names().into_iter().collect();
        names.sort();
        names
    }
}

pub struct AutocompleteState {
    /// Autocomplete rule that the main caret was last on
    current_autocomplete: Option<AutocompleteRule>,
}

impl AutocompleteState {
    pub fn new() -> Self {
        Self {
            current_autocomplete: None,
        }
    }

    /// Opens and gets the autocomplete results, taking into account the last selected autocomplete result
    pub fn get_autocomplete<'a>(
        &'a mut self,
        matches: Vec<AutocompleteRuleMatch<'a>>,
        caret_position: MinimalInputRowPosition,
    ) -> AutocompleteResults<'a> {
        let selected_index = self
            .current_autocomplete
            .take()
            .and_then(|last_rule| matches.iter().position(|v| v.rule == &last_rule))
            .unwrap_or(0);

        self.current_autocomplete = matches.get(selected_index).map(|v| v.rule.clone());
        AutocompleteResults::new(selected_index, matches, caret_position)
    }

    pub fn set_current_autocomplete(&mut self, rule: Option<AutocompleteRule>) {
        self.current_autocomplete = rule;
    }
}
