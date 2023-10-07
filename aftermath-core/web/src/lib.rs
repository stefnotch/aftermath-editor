pub mod math_editor;
pub mod math_parser;
mod utils;

use log::Level;
use utils::set_panic_hook;
use wasm_bindgen::prelude::*;

// TODO: Or maybe just use the default allocator
#[cfg(target_arch = "wasm32")]
use lol_alloc::{FreeListAllocator, LockedAllocator};

#[cfg(target_arch = "wasm32")]
#[global_allocator]
static ALLOCATOR: LockedAllocator<FreeListAllocator> =
    LockedAllocator::new(FreeListAllocator::new());

#[wasm_bindgen(start)]
fn main() {
    set_panic_hook();
    let _ = console_log::init_with_level(Level::Debug);
}
