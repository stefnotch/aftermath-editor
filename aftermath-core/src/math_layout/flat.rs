use chumsky::BoxStream;

use super::row::Row;
use std::iter::once;

/// math layout, but flattened for the parser
enum LayoutFlat {
    RowStart {
        index_in_element: usize,
    },
    RowEnd,
    SimpleElementStart {
        x: SimpleElementType,
        index_in_row: usize,
    },
    SimpleElementEnd,
    TableStart {
        row_width: usize,
        index_in_row: usize,
    },
    TableEnd,
    Symbol {
        value: String,
        index_in_row: usize,
    },
    Bracket {
        value: String,
        index_in_row: usize,
    },
}

enum SimpleElementType {
    Fraction,
    Root,
    Under,
    Over,
    Sup,
    Sub,
}

pub fn flatten_row(row: &Row) -> BoxStream<LayoutFlat> {}
