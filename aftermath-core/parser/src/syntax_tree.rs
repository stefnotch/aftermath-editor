use core::fmt;
use std::ops::Range;

use serde::Serialize;

use input_tree::row::RowIndex;

/// A concrete syntax tree.
/// Has a few invariants:
/// - Parent range always contains all the child ranges
/// - Child ranges are sorted (TODO: do I need this?)
/// - Child ranges are non-overlapping
/// - Child ranges are contiguous, we don't skip any tokens
///
/// references the input tree
#[derive(Debug, Serialize)]
pub enum SyntaxNode {
    Container(SyntaxContainerNode),
    Leaf(SyntaxLeafNode),
}

impl SyntaxNode {
    pub fn range(&self) -> Range<usize> {
        match self {
            SyntaxNode::Container(node) => node.range.clone(),
            SyntaxNode::Leaf(node) => node.range.clone(),
        }
    }
}

/// A node in a concrete syntax tree that contains other nodes.
/// This can also be a "Variable" node, which just contains a single leaf node.
#[derive(Debug, Serialize)]
pub struct SyntaxContainerNode {
    /// name of the function or constant
    pub name: String,
    /// children of the node, including the operator token(s)
    pub children: Vec<SyntaxNode>,
    /// Which container and row to go down to reach this node
    pub row_index: Option<RowIndex>,
    /// value, especially for constants
    /// stored as bytes, and interpreted according to the name
    pub value: Vec<u8>,
    /// The range of this in the input tree row.
    pub range: Range<usize>,
}

/// A leaf node in a concrete syntax tree.
#[derive(Debug, Serialize)]
pub struct SyntaxLeafNode {
    /// Type of the leaf node
    pub node_type: LeafNodeType,
    /// The range of this in the input tree row.
    /// The range can be empty.
    pub range: Range<usize>,
    /// The symbols that make up this node, joined into one string.
    pub symbols: String,
}

#[derive(Debug, Serialize, PartialEq, Eq, Clone)]
pub enum LeafNodeType {
    /// An operator node, this can be skipped in an abstract syntax tree
    Symbol,
    /// A symbol node
    Operator,
}

impl fmt::Display for SyntaxNode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SyntaxNode::Container(node) => write!(f, "{}", node),
            SyntaxNode::Leaf(node) => write!(f, "{}", node),
        }
    }
}

impl fmt::Display for SyntaxContainerNode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // S-expression
        // S here sadly doesn't stand for Stef
        write!(f, "({}", self.name)?;

        // Always print the value
        write!(f, " (")?;
        if !self.value.is_empty() {
            for byte in &self.value {
                write!(f, "{:02x}", byte)?;
            }
        }
        write!(f, ")")?;

        // Optionally print the arguments
        if !self.children.is_empty() {
            for arg in &self.children {
                write!(f, " {}", arg)?;
            }
        }
        write!(f, ")")
    }
}

impl fmt::Display for SyntaxLeafNode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "\"")?;
        // Print string, escaping quotes
        for c in self.symbols.chars() {
            match c {
                '"' => write!(f, "\\\"")?,
                '\\' => write!(f, "\\\\")?,
                _ => write!(f, "{}", c)?,
            }
        }
        write!(f, "\"")
    }
}
