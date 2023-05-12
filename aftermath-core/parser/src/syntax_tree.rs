use core::fmt;
use std::ops::Range;

use serde::Serialize;

use input_tree::row::RowIndex;

/// A concrete syntax tree.
/// Has a few invariants:
/// - Parent range always contains all the child ranges
/// - Child ranges are sorted
/// - Child ranges are non-overlapping
/// - Child ranges are contiguous, we don't skip any tokens
/// - Child range rules only apply if they are on the same row (see row_index)
///
/// indices reference the input tree
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

    pub fn row_index(&self) -> Option<RowIndex> {
        match self {
            SyntaxNode::Container(node) => node.row_index(),
            SyntaxNode::Leaf(_) => None,
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
    /// TODO: Maybe there's a better way to do this?
    row_index: Option<RowIndex>,
    /// value, especially for constants
    /// stored as bytes, and interpreted according to the name
    pub value: Vec<u8>,
    /// The range of this in the input tree row.
    range: Range<usize>,
}

/// A leaf node in a concrete syntax tree.
#[derive(Debug, Serialize)]
pub struct SyntaxLeafNode {
    /// Type of the leaf node
    pub node_type: LeafNodeType,
    /// The range of this in the input tree row.
    /// The range can be empty.
    pub range: Range<usize>,
    /// The symbols that make up this node, stored as a list of grapheme clusters.
    pub symbols: Vec<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq, Clone)]
pub enum LeafNodeType {
    /// An operator node, this can be skipped in an abstract syntax tree
    Symbol,
    /// A symbol node
    Operator,
}

impl SyntaxContainerNode {
    pub fn new(name: String, range: Range<usize>, children: Vec<SyntaxNode>) -> Self {
        if let Some(child_range) = SyntaxContainerNode::get_combined_range(&children) {
            assert!(range.start <= child_range.start && child_range.end <= range.end);
        }
        Self {
            name,
            children,
            range,
            row_index: None,
            value: vec![],
        }
    }

    /// Returns the range of all the children combined, and verifies the invariants.
    fn get_combined_range(children: &[SyntaxNode]) -> Option<Range<usize>> {
        let mut child_iter = children.iter().filter(|c| c.row_index().is_none());

        if let Some(first) = child_iter.next() {
            let mut prev_child_range = first.range();
            for child in child_iter {
                let child_range = child.range();
                assert!(prev_child_range.end == child_range.start);
                prev_child_range = child_range;
            }
            Some(first.range().start..prev_child_range.end)
        } else {
            None
        }
    }

    pub fn with_row_index(mut self, row_index: RowIndex) -> Self {
        self.row_index = Some(row_index);
        self
    }

    pub fn range(&self) -> Range<usize> {
        self.range.clone()
    }

    pub fn row_index(&self) -> Option<RowIndex> {
        self.row_index.clone()
    }
}

pub fn get_child_range_end(children: &[SyntaxNode]) -> usize {
    assert!(children.len() > 0);
    let child_iter = children.iter().filter(|c| c.row_index().is_none());
    child_iter.last().unwrap().range().end
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
