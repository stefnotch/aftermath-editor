use super::BasicEdit;

pub trait Editable {
    fn apply_edits(&mut self, edits: &[BasicEdit]) {
        for edit in edits {
            self.apply_edit(edit);
        }
    }
    fn apply_edit(&mut self, edit: &BasicEdit);
}
