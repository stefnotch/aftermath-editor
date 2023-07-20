use core::fmt;

use input_tree::print_helpers::{write_with_escaped_double_quotes, write_with_separator};

use crate::{SyntaxLeafNode, SyntaxNode};

use super::{NodeIdentifier, SyntaxTree};

impl fmt::Display for SyntaxTree {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SyntaxTree::Children(children) => {
                write_with_separator(children, " ", f)?;
            }
            SyntaxTree::NewRows(children) => {
                write!(f, "{}", children)?;
            }
            SyntaxTree::Leaf(child) => {
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

impl fmt::Display for NodeIdentifier {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write_with_separator(&self.0, "::", f)
    }
}
