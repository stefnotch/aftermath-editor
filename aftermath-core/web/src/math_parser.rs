use std::rc::Rc;

use parser::{
    parse_module::{BoxedParseModule, ParseModule},
    parse_modules::{ParseModuleCollection, ParseModules},
    parser::MathParser,
    rule_collections::{
        arithmetic_rules::ArithmeticRules, built_in_rules::BuiltInRules,
        calculus_rules::CalculusRules, collections_rules::CollectionsRules,
        comparison_rules::ComparisonRules, core_rules::CoreRules, function_rules::FunctionRules,
        logic_rules::LogicRules, string_rules::StringRules,
    },
    syntax_tree::SyntaxNodeNameMap,
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
    pub fn new(modules: &ParseModulesBindings) -> Self {
        let built_in = modules.built_in.clone();
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
    built_in: Rc<BuiltInRules>,
    parse_modules: ParseModules,
}

#[wasm_bindgen]
impl ParseModulesBindings {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut parse_modules = ParseModules::new();
        Self {
            built_in: Rc::new(BuiltInRules::new(&mut parse_modules)),
            parse_modules,
        }
    }

    pub fn get_built_in(&self) -> BoxedParseModule {
        BoxedParseModule::new(self.built_in.clone())
    }

    pub fn get_syntax_node_name_map(&self) -> SyntaxNodeNameMap {
        self.parse_modules.get_rule_name_map().clone()
    }
}

#[wasm_bindgen]
pub struct ParseModulesCreator;

#[wasm_bindgen]
impl ParseModulesCreator {
    pub fn make_core(modules: &mut ParseModulesBindings) -> BoxedParseModule {
        CoreRules::new(&mut modules.parse_modules, &modules.built_in).boxed()
    }
    pub fn make_arithmetic(modules: &mut ParseModulesBindings) -> BoxedParseModule {
        ArithmeticRules::new(&mut modules.parse_modules).boxed()
    }
    pub fn make_calculus(modules: &mut ParseModulesBindings) -> BoxedParseModule {
        CalculusRules::new(&mut modules.parse_modules).boxed()
    }
    pub fn make_collections(modules: &mut ParseModulesBindings) -> BoxedParseModule {
        CollectionsRules::new(&mut modules.parse_modules).boxed()
    }
    pub fn make_comparison(modules: &mut ParseModulesBindings) -> BoxedParseModule {
        ComparisonRules::new(&mut modules.parse_modules).boxed()
    }
    pub fn make_function(modules: &mut ParseModulesBindings) -> BoxedParseModule {
        FunctionRules::new(&mut modules.parse_modules, &modules.built_in).boxed()
    }
    pub fn make_logic(modules: &mut ParseModulesBindings) -> BoxedParseModule {
        LogicRules::new(&mut modules.parse_modules).boxed()
    }
    pub fn make_string(modules: &mut ParseModulesBindings) -> BoxedParseModule {
        StringRules::new(&mut modules.parse_modules).boxed()
    }
}
