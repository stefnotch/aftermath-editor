use super::BasicEdit;

pub trait Editable {
    fn apply_edit(&mut self, edit: &BasicEdit);
}
