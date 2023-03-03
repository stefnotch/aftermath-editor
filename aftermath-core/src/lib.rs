//mod math_layout;
//mod math_layout;
mod utils;

use std::collections::HashMap;

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

/*
trait Node: Sized {
    type Child: Node;
    type Value;
    fn len(&self) -> usize;
    fn child_at(&self, index: usize) -> Option<Self::Child>;
    fn value(&self) -> Self::Value; // Table size for the table, character for the character, etc.

    // new node with the child at index replaced with the result of f
    fn with_child_at<F>(&self, index: usize, f: F) -> Option<Self>
    where
        F: FnOnce(&Self::Child) -> Self::Child;
}

struct Row {
    values: Vec<Element>,
}

impl Node for Row {
    type Child = Element;
    type Value = ();
    fn len(&self) -> usize {
        self.values.len()
    }
    fn child_at(&self, index: usize) -> Option<Self::Child> {
        self.values.get(index)
    }
    fn value(&self) -> Self::Value {}
    fn with_child_at<F>(&self, index: usize, f: F) -> Option<Self>
    where
        F: FnOnce(&Self::Child) -> Self::Child,
    {
        let mut new_values = self.values.clone();
        new_values[index] = f(&new_values[index]);
        Some(Row { values: new_values })
    }
}

struct Element {}

impl Node for Element {}
 */
