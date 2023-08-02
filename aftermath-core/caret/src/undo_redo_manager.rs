use input_tree::editing::invertible::Invertible;

pub struct UndoRedoManager<T>
where
    T: Invertible + Clone,
{
    /// Undo-stack, with *normal* actions.
    /// Have to be inverted before they can be applied.
    undo_stack: Vec<T>,

    /// Redo-stack, with *normal* actions.
    /// Can simply be applied.
    redo_stack: Vec<T>,
    // TODO: Far future
    // - Cap the size of the undo-stack
    // - Store the entire state of the formula in a separate long-term undo stack every once in a while/every x actions/every x seconds
    // - That lets one undo all the way back to the initial state without having a huge undo-stack
    // - Remove clone constraint
}

impl<T: Invertible + Clone> UndoRedoManager<T> {
    pub fn new() -> Self {
        Self {
            undo_stack: vec![],
            redo_stack: vec![],
        }
    }

    /// Push a redo-action to the undo-stack and clear the redo-stack.
    pub fn push(&mut self, action: T) {
        self.undo_stack.push(action);
        self.redo_stack = Vec::new();
    }

    ///Take an undo-action
    pub fn undo(&mut self) -> Option<T::Inverse> {
        let action = self.undo_stack.pop()?;
        let inverse_action = action.inverse();
        self.redo_stack.push(action);
        Some(inverse_action)
    }

    /// Take a redo-action
    pub fn redo(&mut self) -> Option<T> {
        let action = self.redo_stack.pop()?;
        self.undo_stack.push(action.clone());
        Some(action)
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }
}
