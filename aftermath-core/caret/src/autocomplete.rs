use input_tree::{
    direction::VerticalDirection,
    editing::{editable::Editable, BasicEdit},
    focus::{MinimalInputRowPosition, MinimalInputRowRange},
    row::Offset,
};
use parser::autocomplete::{AutocompleteRule, AutocompleteRuleMatch};

pub struct AutocorrectActionBuilder {
    autocorrect: Option<AutocorrectAction>,
}

impl Default for AutocorrectActionBuilder {
    fn default() -> Self {
        Self { autocorrect: None }
    }
}

impl AutocorrectActionBuilder {
    pub fn finish(self, edits: &[BasicEdit]) -> Option<AutocorrectAction> {
        self.autocorrect.map(|mut v| {
            v.caret_range.apply_edits(edits);
            v
        })
    }
}

#[derive(Clone)]
#[must_use]
pub struct AutocorrectAction {
    pub rule: AutocompleteRule,
    pub caret_range: MinimalInputRowRange,
}

pub struct AutocompleteResults<'a> {
    selected_index: usize,
    matches: Vec<AutocompleteRuleMatch<'a>>,
    caret_position: MinimalInputRowPosition,
}

impl<'a> AutocompleteResults<'a> {
    pub fn new(
        selected_index: usize,
        matches: Vec<AutocompleteRuleMatch<'a>>,
        caret_position: MinimalInputRowPosition,
    ) -> Self {
        assert!(selected_index < matches.len());
        Self {
            selected_index,
            matches,
            caret_position,
        }
    }

    pub fn start_autocorrect(&self) -> AutocorrectActionBuilder {
        let selected = self.get_selected();
        if !selected.is_complete_match() {
            return Default::default();
        }
        let caret_range = self.get_caret_range(selected);
        AutocorrectActionBuilder {
            autocorrect: Some(AutocorrectAction {
                rule: selected.rule.clone(),
                caret_range,
            }),
        }
    }

    pub fn get_selected(&self) -> &AutocompleteRuleMatch<'a> {
        self.matches.get(self.selected_index).unwrap()
    }

    pub fn move_selection(&mut self, direction: VerticalDirection) {
        match direction {
            VerticalDirection::Up => {
                if self.selected_index > 0 {
                    self.selected_index -= 1;
                }
            }
            VerticalDirection::Down => {
                if self.selected_index < self.matches.len() - 1 {
                    self.selected_index += 1;
                }
            }
        }
    }

    pub fn get_caret_range(&self, rule_match: &AutocompleteRuleMatch<'a>) -> MinimalInputRowRange {
        MinimalInputRowRange {
            row_indices: self.caret_position.row_indices.clone(),
            start: self.caret_position.offset,
            end: Offset(
                self.caret_position
                    .offset
                    .0
                    .saturating_sub(rule_match.input_match_length),
            ),
        }
    }

    pub fn destructure(
        &self,
    ) -> (
        usize,
        &Vec<AutocompleteRuleMatch<'a>>,
        MinimalInputRowPosition,
    ) {
        (
            self.selected_index,
            &self.matches,
            self.caret_position.clone(),
        )
    }
}
