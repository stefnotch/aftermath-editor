use core::fmt;

use input_tree::print_helpers::{write_with_escaped_double_quotes, write_with_separator};

use crate::syntax_tree::{SyntaxLeafNode, SyntaxNode};

use super::SyntaxNodeChildren;

impl fmt::Display for SyntaxNodeChildren {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SyntaxNodeChildren::Children(children) => {
                write_with_separator(children, " ", f)?;
            }
            SyntaxNodeChildren::NewRows(children) => {
                write!(f, "{}", children)?;
            }
            SyntaxNodeChildren::Leaf(child) => {
                write!(f, "{}", child)?;
            }
        };
        Ok(())
    }
}

impl fmt::Display for SyntaxNode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // S-expression
        // S here sadly doesn't stand for Stef
        write!(f, "({}", self.name)?;

        // Print the arguments, every argument has () around it
        if !self.children.is_empty() {
            write!(f, " ")?;
            write!(f, "{}", self.children)?;
        }

        // Print the value
        if !self.value.is_empty() {
            write!(f, " ")?;
            for byte in &self.value {
                write!(f, "{:02x}", byte)?;
            }
        }

        write!(f, ")")
    }
}

impl fmt::Display for SyntaxLeafNode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "\"")?;
        for grapheme in &self.symbols {
            write_with_escaped_double_quotes(grapheme, f)?;
        }
        write!(f, "\"")
    }
}
