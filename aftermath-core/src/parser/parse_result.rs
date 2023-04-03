use core::fmt;
use std::ops::Range;

use serde::Serialize;

#[derive(Debug)]
pub struct ParseResult<T>
where
    T: fmt::Debug,
{
    /// always returns a value, even if there are errors
    pub value: T,
    /// error sink
    pub errors: Vec<ParseError>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ParseError {
    pub error: ParseErrorType,
    /// the range of this in the original math layout
    pub range: Range<usize>,
}

#[derive(Debug, Clone, Serialize)]
pub enum ParseErrorType {
    UnexpectedEndOfInput,
    UnexpectedPostfixOperator,
    Custom(String),
    UnexpectedToken,
}
