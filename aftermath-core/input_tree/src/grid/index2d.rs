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

    pub fn add_checked<T>(&self, other: (usize, usize), grid: &impl Grid<T>) -> Option<Self> {
        let mut result = self.clone();
        let (x, y) = other;
        result.x = result.x.checked_add(x)?;
        result.y = result.y.checked_add(y)?;
        result.with_grid(grid)
    }

    pub fn sub_checked<T>(&self, other: (usize, usize), grid: &impl Grid<T>) -> Option<Self> {
        let mut result = self.clone();
        let (x, y) = other;
        result.x = result.x.checked_sub(x)?;
        result.y = result.y.checked_sub(y)?;
        result.with_grid(grid)
    }

    fn with_grid<T>(self, grid: &impl Grid<T>) -> Option<Self> {
        let (width, height) = grid.size();
        if self.width != width {
            None
        } else if self.x >= width || self.y >= height {
            None
        } else {
            Some(self)
        }
    }

    pub fn to_index_checked<T>(self, grid: &impl Grid<T>) -> Option<usize> {
        let checked = self.with_grid(grid);
        checked.map(|v| v.to_index())
    }
}

impl From<Index2D> for (usize, usize) {
    fn from(index: Index2D) -> Self {
        (index.x, index.y)
    }
}
