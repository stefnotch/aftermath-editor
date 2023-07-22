use crate::{focus::MinimalInputRowPosition, node::InputNode};

use super::invertible::Invertible;

///
/// Useless note: A Vec<BasicEdit> together with the .concat() method forms an algebraic group.
/// It is associative, has an identity element ([]) and can be inverted.
///
/// When creating multiple disjoint edits, I recommend creating them bottom to top, right to left.
/// That way, one edit doesn't afftect the indices of the other edits.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BasicEdit {
    Insert {
        position: MinimalInputRowPosition,
        values: Vec<InputNode>,
    },
    Delete {
        /// Deletes to the right of the position
        position: MinimalInputRowPosition,
        /// The values that were removed, used for undo.
        values: Vec<InputNode>,
    },
    // We could also account for grid edits,
    // but it's not neccessary just yet.
}

impl BasicEdit {
    pub fn position(&self) -> &MinimalInputRowPosition {
        match self {
            BasicEdit::Insert { position, .. } => position,
            BasicEdit::Delete { position, .. } => position,
        }
    }
}

impl Invertible for BasicEdit {
    type Inverse = BasicEdit;

    fn inverse(&self) -> Self::Inverse {
        match self {
            BasicEdit::Insert { position, values } => BasicEdit::Delete {
                position: position.clone(),
                values: values.clone(),
            },
            BasicEdit::Delete { position, values } => BasicEdit::Insert {
                position: position.clone(),
                values: values.clone(),
            },
        }
    }
}
