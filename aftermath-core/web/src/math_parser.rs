use std::rc::Rc;

use parser::{
    parse_module::BoxedParseModule,
    parse_modules::{ParseModuleCollection, ParseModules},
    parser::MathParser,
    rule_collections::built_in_rules::BuiltInRules,
};
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
pub struct MathParserBindings {
    parser: Rc<MathParser>,
}

#[wasm_bindgen]
impl MathParserBindings {
    #[wasm_bindgen(constructor)]
    pub fn new(parse_modules: ParseModuleCollectionBindings) -> Self {
        Self {
            parser: Rc::new(MathParser::new(parse_modules.build())),
        }
    }
}
impl MathParserBindings {
    pub fn get_parser(&self) -> Rc<MathParser> {
        self.parser.clone()
    }
}

#[wasm_bindgen]
pub struct ParseModuleCollectionBindings {
    built_in: Rc<BuiltInRules>,
    modules: Vec<BoxedParseModule>,
}

#[wasm_bindgen]
impl ParseModuleCollectionBindings {
    #[wasm_bindgen(constructor)]
    pub fn new(parse_modules: &mut ParseModulesBindings) -> Self {
        let built_in = Rc::new(BuiltInRules::new(&mut parse_modules.parse_modules));
        Self {
            built_in: built_in.clone(),
            modules: vec![BoxedParseModule::new(built_in.clone())],
        }
    }

    pub fn add_module(&mut self, module: BoxedParseModule) {
        self.modules.push(module);
    }
}
impl ParseModuleCollectionBindings {
    fn build(self) -> ParseModuleCollection {
        ParseModuleCollection::new(
            self.built_in,
            self.modules.iter().map(|v| v.get_module()).collect(),
        )
    }
}

/// For creating the parse modules.
#[wasm_bindgen]
pub struct ParseModulesBindings {
    parse_modules: ParseModules,
}

#[wasm_bindgen]
impl ParseModulesBindings {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            parse_modules: ParseModules::new(),
        }
    }
}
