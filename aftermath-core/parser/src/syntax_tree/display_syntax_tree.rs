use core::fmt;

use crate::{SyntaxLeafNode, SyntaxNode};

use super::SyntaxNodes;

impl fmt::Display for SyntaxNodes {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SyntaxNodes::Containers(children) => {
                for child in children {
                    write!(f, "{}", child)?;
                }
            }
            SyntaxNodes::Leaves(children) => {
                for child in children {
                    write!(f, "{}", child)?;
                }
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

        // Always print the arguments
        write!(f, " {}", self.children)?;

        // Optionally print the value
        if !self.value.is_empty() {
            write!(f, " (")?;
            for byte in &self.value {
                write!(f, "{:02x}", byte)?;
            }
            write!(f, ")")?;
        }

        write!(f, ")")
    }
}

impl fmt::Display for SyntaxLeafNode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "\"")?;
        // Print string, escaping quotes
        for grapheme in &self.symbols {
            for c in grapheme.chars() {
                match c {
                    '"' => write!(f, "\\\"")?,
                    '\\' => write!(f, "\\\\")?,
                    _ => write!(f, "{}", c)?,
                }
            }
        }
        write!(f, "\"")
    }
}
