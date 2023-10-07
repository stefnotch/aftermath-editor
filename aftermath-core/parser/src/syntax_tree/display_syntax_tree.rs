use core::fmt;

use input_tree::{
    grid::Grid,
    print_helpers::{write_with_escaped_double_quotes, write_with_separator},
};

use crate::syntax_tree::{SyntaxLeafNode, SyntaxNode};

use super::{SyntaxNodeChildren, SyntaxNodeNameMap};

pub struct SyntaxNodeWithDisplay<'a, 'b> {
    pub node: &'a SyntaxNode,
    pub mapper: &'b SyntaxNodeNameMap,
}

impl SyntaxNode {
    pub fn with_display<'a, 'b>(
        &'a self,
        mapper: &'b SyntaxNodeNameMap,
    ) -> SyntaxNodeWithDisplay<'a, 'b> {
        SyntaxNodeWithDisplay { node: self, mapper }
    }
}

impl<'a, 'b> fmt::Display for SyntaxNodeWithDisplay<'a, 'b> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // S-expression
        // S here sadly doesn't stand for Stef
        if let Some(name) = self.mapper.get_reverse(self.node.name) {
            write!(f, "({}", name)?;
        } else {
            write!(f, "(<unknown {:?}>", self.node.name)?;
        }

        // Print the arguments, every argument has () around it
        if !self.node.children.is_empty() {
            write!(f, " ")?;
            match &self.node.children {
                SyntaxNodeChildren::NewRows(values) => {
                    let (width, height) = values.size();
                    write!(f, "{}x{}", width, height)?;
                    for value in values.values() {
                        write!(f, " {}", value.with_display(self.mapper))?;
                    }
                }
                SyntaxNodeChildren::Children(values) => write_with_separator(
                    values.iter().map(|v| v.with_display(self.mapper)),
                    " ",
                    f,
                )?,
                SyntaxNodeChildren::Leaf(value) => write!(f, "{}", value)?,
            };
        }

        // Print the value
        if !self.node.value.is_empty() {
            write!(f, " ")?;
            for byte in &self.node.value {
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
