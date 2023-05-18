use core::fmt;

use crate::{SyntaxLeafNode, SyntaxNode};

use super::{NodeIdentifier, SyntaxNodes};

impl fmt::Display for SyntaxNodes {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SyntaxNodes::Containers(children) => {
                if let Some((first, tail)) = children.split_first() {
                    write!(f, "{}", first)?;
                    for child in tail {
                        write!(f, " {}", child)?;
                    }
                }
            }
            SyntaxNodes::NewRows(children) => {
                if let Some(((_, first), tail)) = children.split_first() {
                    write!(f, "{}", first)?;
                    for (_, child) in tail {
                        write!(f, " {}", child)?;
                    }
                }
            }
            SyntaxNodes::NewTable(children, _) => {
                // TODO: Maybe print the table differently?
                if let Some(((_, first), tail)) = children.split_first() {
                    write!(f, "{}", first)?;
                    for (_, child) in tail {
                        write!(f, " {}", child)?;
                    }
                }
            }
            SyntaxNodes::Leaves(children) => {
                if let Some((first, tail)) = children.split_first() {
                    write!(f, "{}", first)?;
                    for child in tail {
                        write!(f, " {}", child)?;
                    }
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

impl fmt::Display for NodeIdentifier {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut values = self.0.iter();

        if let Some(value) = values.next() {
            write!(f, "{}", value)?;
            for value in values {
                write!(f, "::{}", value)?;
            }
        }

        Ok(())
    }
}
