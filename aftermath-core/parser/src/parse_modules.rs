use crate::{
    autocomplete::AutocompleteRule,
    parse_module::{ParseModule, ParseRule},
    syntax_tree::PathIdentifier,
};

/// All parsing modules first get registered here. Then we can statically verify a few things.
/// For example, we can verify that all modules have unique names.
///
/// And then, when we construct a parser, we use some of these modules.
pub struct ParseModules {
    modules: Vec<Box<dyn ParseModule>>,
}

// TODO: Wasm bindgen this
impl ParseModules {
    pub fn new() -> Self {
        Self {
            modules: Vec::new(),
        }
    }

    pub fn register_module<T: ParseModule + 'static>(&mut self, module: T) -> ParseModuleRef {
        let name = module.get_module_name().clone();
        self.modules.push(Box::new(module));
        ParseModuleRef(name)
    }

    pub fn get_modules(
        &self,
        refs: impl IntoIterator<Item = ParseModuleRef>,
    ) -> Vec<&dyn ParseModule> {
        refs.into_iter()
            .map(|v| {
                self.modules
                    .iter()
                    .find(|v2| v2.get_module_name() == &v.0)
                    .unwrap_or_else(|| panic!("Module {:?} not found", v.0))
                    .as_ref()
            })
            .collect()
    }
}

impl Default for ParseModules {
    fn default() -> Self {
        Self::new()
    }
}

pub struct ParseModuleRef(PathIdentifier);
