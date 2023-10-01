use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub enum Direction {
    Left,
    Right,
    Up,
    Down,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub enum HorizontalDirection {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub enum VerticalDirection {
    Up,
    Down,
}

impl From<HorizontalDirection> for Direction {
    fn from(val: HorizontalDirection) -> Self {
        match val {
            HorizontalDirection::Left => Direction::Left,
            HorizontalDirection::Right => Direction::Right,
        }
    }
}

impl From<VerticalDirection> for Direction {
    fn from(val: VerticalDirection) -> Self {
        match val {
            VerticalDirection::Up => Direction::Up,
            VerticalDirection::Down => Direction::Down,
        }
    }
}
