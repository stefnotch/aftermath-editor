use std::rc::Rc;

use crate::{
    parse_module::ParseModule,
    rule_collections::built_in_rules::BuiltInRules,
    syntax_tree::{PathIdentifier, SyntaxNodeNameId, SyntaxNodeNameMap},
};

/// When creating modules, you need to pass this struct to the constructor.
pub struct ParseModules {
    rule_name_map: SyntaxNodeNameMap,
}

impl ParseModules {
    pub fn new() -> Self {
        Self {
            rule_name_map: SyntaxNodeNameMap::new(),
        }
    }

    // TODO: Even cooler would be
    // fn start_module() -> ModuleBuilder
    // ...
    pub fn with_rule_name(&mut self, name: PathIdentifier) -> SyntaxNodeNameId {
        self.rule_name_map.add(name)
    }

    pub fn get_rule_name(&self, name: PathIdentifier) -> SyntaxNodeNameId {
        self.rule_name_map.get(&name).unwrap_or_else(|| {
            panic!(
                "Rule name not found: {:?}, it should have been added by a previous module",
                name
            )
        })
    }

    pub fn get_rule_name_map(&self) -> &SyntaxNodeNameMap {
        &self.rule_name_map
    }
}

impl Default for ParseModules {
    fn default() -> Self {
        Self::new()
    }
}

pub struct ParseModuleCollection {
    built_in: Rc<BuiltInRules>,
    /// The order of modules is important.
    /// Remember to include the built-in rules.
    modules: Vec<Rc<dyn ParseModule>>,
}

impl ParseModuleCollection {
    pub fn new(built_in: Rc<BuiltInRules>, modules: Vec<Rc<dyn ParseModule>>) -> Self {
        Self { built_in, modules }
    }

    pub fn get_modules(&self) -> &[Rc<dyn ParseModule>] {
        &self.modules
    }

    pub fn get_built_in(&self) -> &Rc<BuiltInRules> {
        &self.built_in
    }
}
