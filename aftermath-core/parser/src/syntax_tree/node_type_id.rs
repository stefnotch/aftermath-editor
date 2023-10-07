use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::PathIdentifier;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Ord, PartialOrd, Hash, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct SyntaxNodeNameId(u32);
impl SyntaxNodeNameId {
    pub fn new(id: u32) -> Self {
        Self(id)
    }
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "wasm", derive(tsify::Tsify), tsify(into_wasm_abi))]
pub struct SyntaxNodeNameMap {
    values: HashMap<PathIdentifier, SyntaxNodeNameId>,
    reverse_values: HashMap<SyntaxNodeNameId, PathIdentifier>,
}

impl SyntaxNodeNameMap {
    pub fn new() -> Self {
        Self {
            values: HashMap::new(),
            reverse_values: HashMap::new(),
        }
    }

    pub fn add(&mut self, path: PathIdentifier) -> SyntaxNodeNameId {
        if let Some(id) = self.values.get(&path) {
            return id.clone();
        }

        let id = SyntaxNodeNameId::new(self.values.len() as u32);
        self.values.insert(path.clone(), id);
        self.reverse_values.insert(id, path.clone());
        id
    }
    pub fn get(&self, path: &PathIdentifier) -> Option<SyntaxNodeNameId> {
        self.values.get(path).cloned()
    }

    pub fn get_reverse(&self, id: SyntaxNodeNameId) -> Option<&PathIdentifier> {
        self.reverse_values.get(&id)
    }
}

impl Default for SyntaxNodeNameMap {
    fn default() -> Self {
        Self::new()
    }
}
