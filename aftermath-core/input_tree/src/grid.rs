use std::fmt;

use serde::{Deserialize, Serialize};

/// A proper grid of values.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Grid<T> {
    values: Vec<T>,
    width: usize,
}

/// A 2D index
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Index2D {
    pub x: usize,
    pub y: usize,
}

impl<T> Grid<T> {
    pub fn from_one_dimensional(values: Vec<T>, width: usize) -> Self {
        assert!(width > 0);
        assert_eq!(values.len() % width, 0);
        Grid { values, width }
    }

    pub fn width(&self) -> usize {
        self.width
    }

    pub fn height(&self) -> usize {
        self.values.len() / self.width
    }

    pub fn get(&self, xy: Index2D) -> Option<&T> {
        let Index2D { x, y } = xy;
        if x >= self.width() || y >= self.height() {
            return None;
        }
        self.values.get(self.xy_to_index(xy))
    }

    pub fn get_mut(&mut self, xy: Index2D) -> Option<&mut T> {
        let Index2D { x, y } = xy;
        if x >= self.width() || y >= self.height() {
            return None;
        }
        let index = self.xy_to_index(xy);
        self.values.get_mut(index)
    }

    pub fn get_by_index(&self, index: usize) -> Option<&T> {
        self.values.get(index)
    }

    pub fn index_to_xy(&self, index: usize) -> Index2D {
        Index2D {
            x: index % self.width,
            y: index / self.width,
        }
    }

    pub fn xy_to_index(&self, xy: Index2D) -> usize {
        let Index2D { x, y } = xy;
        y * self.width + x
    }

    pub fn values(&self) -> &[T] {
        &self.values
    }

    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }
}

impl<T: std::fmt::Display> fmt::Display for Grid<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}x{}", self.width(), self.height())?;
        for value in &self.values {
            write!(f, " {}", value)?;
        }
        Ok(())
    }
}
