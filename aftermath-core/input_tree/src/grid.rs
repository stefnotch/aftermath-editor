mod grid_view;
mod index2d;
pub use grid_view::*;
pub use index2d::*;

use std::fmt;

use serde::{Deserialize, Serialize};

pub trait Grid<T> {
    fn width(&self) -> usize {
        self.size().0
    }
    fn height(&self) -> usize {
        self.size().1
    }
    fn size(&self) -> (usize, usize);
    fn get(&self, xy: Index2D) -> Option<&T>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GridDirection {
    Row,
    Column,
}

/// A proper grid of values.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct GridVec<T> {
    values: Vec<T>,
    width: usize,
}

impl<T> Grid<T> for GridVec<T> {
    fn size(&self) -> (usize, usize) {
        (self.width, self.values.len() / self.width)
    }

    fn get(&self, xy: Index2D) -> Option<&T> {
        self.values.get(xy.to_index_checked(self)?)
    }
}

impl<T> GridVec<T> {
    pub fn from_one_dimensional(values: Vec<T>, width: usize) -> Self {
        assert!(width > 0);
        assert_eq!(values.len() % width, 0);
        GridVec { values, width }
    }

    pub fn get_mut(&mut self, xy: Index2D) -> Option<&mut T> {
        let index = xy.to_index_checked(self)?;
        self.values.get_mut(index)
    }

    pub fn set(&mut self, xy: Index2D, value: T) -> Option<T> {
        let cell = self.get_mut(xy)?;
        let old_value = std::mem::replace(cell, value);
        Some(old_value)
    }

    pub fn values(&self) -> impl Iterator<Item = &T> {
        self.values.iter()
    }

    pub fn into_iter(self) -> impl Iterator<Item = T> {
        self.values.into_iter()
    }

    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    pub fn get_view(&self, range: GridRectangle) -> GridView<'_, T> {
        GridView::new(self, range)
    }
}

impl<T: std::fmt::Display> fmt::Display for GridVec<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}x{}", self.width(), self.height())?;
        for value in &self.values {
            write!(f, " {}", value)?;
        }
        Ok(())
    }
}
