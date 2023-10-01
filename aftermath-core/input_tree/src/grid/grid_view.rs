use std::ops::Range;

use serde::{Deserialize, Serialize};

use super::{Grid, GridVec, Index2D};

/// A read-only view into a sub-grid.
pub struct GridView<'a, T> {
    grid: &'a GridVec<T>,
    range: GridRectangle,
}

impl<'a, T> Grid<T> for GridView<'a, T> {
    fn size(&self) -> (usize, usize) {
        self.range.size()
    }

    fn get(&self, xy: Index2D) -> Option<&T> {
        self.grid
            .values
            .get(xy.to_index_checked(self)? + self.range.start)
    }
}

impl<'a, T> GridView<'a, T> {
    pub fn new(grid: &'a GridVec<T>, range: GridRectangle) -> Self {
        Self { grid, range }
    }

    pub fn is_empty(&self) -> bool {
        self.range.is_empty()
    }
}

/// A rectangular range in a grid.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
// TODO: Implement a custom https://serde.rs/impl-serialize.html
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct GridRectangle {
    /// Invariant: range.start <= range.end
    /// The start and end fields are conceptually turned into 2D positions, and then a rectangle is constructed.
    /// e.g. for a grid with width 6:
    /// [. . S . . .]
    /// [. . . . . .]
    /// [. . . . E .]
    start: usize,
    /// Exclusive end
    end: usize,
    width: usize,
}

impl GridRectangle {
    pub fn new(range: Range<usize>, width: usize) -> Self {
        Self {
            start: range.start,
            end: if !range.is_empty() {
                range.end
            } else {
                range.start
            },
            width,
        }
    }

    pub fn width(&self) -> usize {
        self.width
    }

    pub fn height(&self) -> usize {
        let start_y = self.start / self.width;
        let end_y = self.end / self.width;
        end_y - start_y
    }

    pub fn size(&self) -> (usize, usize) {
        (self.width(), self.height())
    }

    pub fn is_empty(&self) -> bool {
        self.start >= self.end
    }

    pub fn start_index(&self) -> Index2D {
        let start_x = self.start % self.width;
        let start_y = self.start / self.width;
        Index2D::new(start_x, start_y, self.width)
    }

    pub fn end_index_inclusive(&self) -> Option<Index2D> {
        if self.is_empty() {
            return None;
        }
        let end_x = (self.end - 1) % self.width;
        let end_y = (self.end - 1) / self.width;
        Some(Index2D::new(end_x, end_y, self.width))
    }

    pub fn from_indices_inclusive<T>(
        start_index: Index2D,
        end_index: Index2D,
        grid: &impl Grid<T>,
    ) -> Self {
        let mut start_index = start_index.to_index_checked(grid).unwrap();
        let mut end_index = end_index.to_index_checked(grid).unwrap();
        if start_index > end_index {
            std::mem::swap(&mut start_index, &mut end_index);
        }
        Self::new(start_index..(end_index + 1), grid.width())
    }
}
