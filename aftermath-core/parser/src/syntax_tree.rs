mod display_syntax_tree;

use std::ops::Range;

use serde::Serialize;

pub use display_syntax_tree::*;
use input_tree::row::Grid;
use unicode_ident::{is_xid_continue, is_xid_start};

/// A node in a concrete syntax tree that contains other nodes.
/// Has a few invariants:
/// - Parent range always contains all the child ranges
/// - Child ranges are sorted
/// - Child ranges are non-overlapping
/// - Child ranges are contiguous, we don't skip any tokens
/// - Child range rules only apply if they are on the same row (see row_index)
/// - For now, either all child ranges will have a new_row, or none of them will
/// - Leaf nodes always have a nonzero range
///
/// indices reference the input tree
#[derive(Debug, Serialize)]
pub struct SyntaxNode {
    /// name of the function or constant
    pub name: NodeIdentifier,
    /// children of the node, including the operator token(s)
    pub children: SyntaxNodes,
    /// value, especially for constants
    /// stored as bytes, and interpreted according to the name
    pub value: Vec<u8>,
    /// The range, expressed in absolute offsets. TODO:
    range: Range<usize>,
}

/// A fully qualified identifier, starting with a namespace and ending with a name.
/// Must be valid identifiers, as specified by https://www.unicode.org/reports/tr31/.
#[derive(Debug, Serialize, Clone, Eq, PartialEq, Hash)]
pub struct NodeIdentifier(Vec<String>);

impl NodeIdentifier {
    pub fn new(name: Vec<String>) -> Self {
        assert!(
            name.len() > 1,
            "A node identifier must have at least a namespace and a name"
        );

        name.iter().for_each(|v| {
            assert!(
                is_identifier(v),
                "A node identifier must only contain valid Unicode identifiers"
            )
        });

        Self(name)
    }
}

fn is_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    chars.next().filter(|c| is_xid_start(*c)).is_some() && chars.all(|c| is_xid_continue(c))
}

#[derive(Debug, Serialize)]
pub enum SyntaxNodes {
    Containers(Vec<SyntaxNode>),
    /// When this syntax node actually starts a new row in the input tree.
    /// TODO: Maybe verify that this has a range of 1?
    NewRows(Grid<SyntaxNode>),
    Leaf(SyntaxLeafNode),
}
impl SyntaxNodes {
    fn is_empty(&self) -> bool {
        match self {
            SyntaxNodes::Containers(children) => children.is_empty(),
            SyntaxNodes::NewRows(children) => children.is_empty(),
            SyntaxNodes::Leaf(_) => false,
        }
    }
}

/// A leaf node in a concrete syntax tree.
/// The range of this node is always non-empty.
#[derive(Debug, Serialize)]
pub struct SyntaxLeafNode {
    /// Type of the leaf node
    pub node_type: LeafNodeType,
    /// The range of this in the input tree row.
    range: Range<usize>,
    /// The symbols that make up this node, stored as a list of grapheme clusters.
    pub symbols: Vec<String>,
}

impl SyntaxLeafNode {
    pub fn new(
        node_type: LeafNodeType,
        range: Range<usize>,
        symbols: Vec<String>,
    ) -> SyntaxLeafNode {
        assert!(range.start < range.end);
        SyntaxLeafNode {
            node_type,
            range,
            symbols,
        }
    }

    pub fn range(&self) -> Range<usize> {
        self.range.clone()
    }
}

#[derive(Debug, Serialize, PartialEq, Eq, Clone)]
pub enum LeafNodeType {
    /// A symbol node
    Symbol,
    /// An operator node, this can be skipped in an abstract syntax tree
    Operator,
}

impl SyntaxNode {
    pub fn new(name: NodeIdentifier, range: Range<usize>, children: SyntaxNodes) -> Self {
        if let Some(child_range) = SyntaxNode::get_combined_range(&children) {
            assert!(range.start <= child_range.start && child_range.end <= range.end);
        }
        Self {
            name,
            children,
            range,
            value: vec![],
        }
    }

    /// Returns the range of all the children combined, and verifies the invariants.
    fn get_combined_range(children: &SyntaxNodes) -> Option<Range<usize>> {
        let binding = match children {
            SyntaxNodes::Containers(children) => {
                children.iter().map(|v| v.range()).collect::<Vec<_>>()
            }
            SyntaxNodes::NewRows(_) => vec![],
            SyntaxNodes::Leaf(child) => vec![child.range()],
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

    pub fn range(&self) -> Range<usize> {
        self.range.clone()
    }
}

pub fn get_child_range_end(children: &[SyntaxNode]) -> usize {
    assert!(children.len() > 0);
    children.last().unwrap().range().end
}
