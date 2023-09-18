use serde::{Deserialize, Serialize};

use super::Grid;

/// A 2D index
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Index2D {
    pub x: usize,
    pub y: usize,
    width: usize,
}

impl Index2D {
    pub fn new(x: usize, y: usize, width: usize) -> Self {
        Self { x, y, width }
    }

    pub fn from_index<T>(index: usize, grid: &impl Grid<T>) -> Self {
        let width = grid.width();
        Self {
            x: index % width,
            y: index / width,
            width,
        }
    }

    pub fn to_index(self) -> usize {
        self.y * self.width + self.x
    }

    pub fn to_index_checked<T>(self, grid: &impl Grid<T>) -> Option<usize> {
        let (width, height) = grid.size();
        if self.width != width {
            None
        } else if self.x >= width || self.y >= height {
            None
        } else {
            Some(self.y * width + self.x)
        }
    }
}

impl From<Index2D> for (usize, usize) {
    fn from(index: Index2D) -> Self {
        (index.x, index.y)
    }
}
