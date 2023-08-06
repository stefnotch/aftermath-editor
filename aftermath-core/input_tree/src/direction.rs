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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HorizontalDirection {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VerticalDirection {
    Up,
    Down,
}

impl Into<Direction> for HorizontalDirection {
    fn into(self) -> Direction {
        match self {
            HorizontalDirection::Left => Direction::Left,
            HorizontalDirection::Right => Direction::Right,
        }
    }
}

impl Into<Direction> for VerticalDirection {
    fn into(self) -> Direction {
        match self {
            VerticalDirection::Up => Direction::Up,
            VerticalDirection::Down => Direction::Down,
        }
    }
}
