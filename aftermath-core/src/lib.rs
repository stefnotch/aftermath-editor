mod math_layout;
mod utils;

use utils::set_panic_hook;
use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet() {
    set_panic_hook();
    alert("Hello, aftermath-core!");
    /*let layout = LayoutZipper::new();
    layout = layout.insert( symbol zipper);
    let symbolChild = match layout.child(0) {
        Some(LeafZipper::Symbol(child)) => child,
        None => None,
    };


    LayoutRow::new(vec![
        LayoutElement::Symbol("a".to_string()),
        LayoutElement::Fraction([
            LayoutRow::new(vec![LayoutElement::Symbol("b".to_string())]),
            LayoutRow::new(vec![LayoutElement::Text([LayoutRow::new(vec![
                LayoutTextElement::Character("n".to_string()),
                LayoutTextElement::Character("e".to_string()),
                LayoutTextElement::Character("k".to_string()),
                LayoutTextElement::Character("o".to_string()),
            ])])]),
        ]),
    ]);

    let math = LayoutZipper::new(layout);
    let _value = math.value();
    let y = math.parent();
    match y {
        Some(parent) => {
            let _grandparent = parent.parent();
            let _value = parent.value();
        }
        None => alert("no parent"),
    }*/
}
