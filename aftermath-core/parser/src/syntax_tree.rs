mod display_syntax_tree;

use std::ops::Range;

use serde::Serialize;

pub use display_syntax_tree::*;
use input_tree::row::RowIndex;

/// A node in a concrete syntax tree that contains other nodes.
/// Has a few invariants:
/// - Parent range always contains all the child ranges
/// - Child ranges are sorted
/// - Child ranges are non-overlapping
/// - Child ranges are contiguous, we don't skip any tokens
/// - Child range rules only apply if they are on the same row (see row_index)
///
/// indices reference the input tree
#[derive(Debug, Serialize)]
pub struct SyntaxNode {
    /// name of the function or constant
    pub name: String,
    /// children of the node, including the operator token(s)
    pub children: SyntaxNodes,
    /// Which container and row to go down to reach this node
    /// TODO: Maybe there's a better way to do this?
    row_index: Option<RowIndex>,
    /// value, especially for constants
    /// stored as bytes, and interpreted according to the name
    pub value: Vec<u8>,
    /// The range of this in the input tree row.
    range: Range<usize>,
}

#[derive(Debug, Serialize)]
pub enum SyntaxNodes {
    Containers(Vec<SyntaxNode>),
    Leaves(Vec<SyntaxLeafNode>),
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

impl SyntaxNode {
    pub fn new(name: String, range: Range<usize>, children: SyntaxNodes) -> Self {
        if let Some(child_range) = SyntaxNode::get_combined_range(&children) {
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
    fn get_combined_range(children: &SyntaxNodes) -> Option<Range<usize>> {
        let binding = match children {
            SyntaxNodes::Containers(children) => children
                .iter()
                .filter(|c| c.row_index().is_none())
                .map(|v| v.range())
                .collect::<Vec<_>>(),
            SyntaxNodes::Leaves(children) => children.iter().map(|v| v.range()).collect(),
        };
        let mut child_iter = binding.iter();
        if let Some(first) = child_iter.next() {
            let mut prev_child_range = first;
            for child in child_iter {
                let child_range = child;
                assert!(prev_child_range.end == child_range.start);
                prev_child_range = child_range;
            }
            Some(first.start..prev_child_range.end)
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

impl SyntaxLeafNode {
    pub fn range(&self) -> Range<usize> {
        self.range.clone()
    }
}
