use std::ops::Range;

use input_tree::grid::Grid;
use serde::{Deserialize, Serialize};

use super::NodeIdentifier;

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
#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct SyntaxNode {
    /// name of the function or constant
    pub name: NodeIdentifier,
    /// children of the node, including the operator token(s)
    pub children: SyntaxNodeChildren,
    /// value, especially for constants
    /// stored as bytes, and interpreted according to the name
    pub value: Vec<u8>,
    /// The range, expressed in offsets relative to the row.
    range: Range<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub enum SyntaxNodeChildren {
    /// When this syntax node actually starts a new row in the input tree.
    /// TODO: Maybe verify that this has a range of 1?
    NewRows(Grid<SyntaxNode>),
    Children(Vec<SyntaxNode>),
    Leaf(SyntaxLeafNode),
}
impl SyntaxNodeChildren {
    pub fn is_empty(&self) -> bool {
        match self {
            SyntaxNodeChildren::NewRows(children) => children.is_empty(),
            SyntaxNodeChildren::Children(children) => children.is_empty(),
            SyntaxNodeChildren::Leaf(_) => false,
        }
    }
}

/// A leaf node in a concrete syntax tree.
/// The range of this node is always non-empty.
#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
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

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone)]
#[cfg_attr(
    feature = "wasm",
    derive(tsify::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub enum LeafNodeType {
    /// A symbol node
    Symbol,
    /// An operator node, this can be skipped in an abstract syntax tree
    Operator,
}

impl SyntaxNode {
    pub fn new(name: NodeIdentifier, range: Range<usize>, children: SyntaxNodeChildren) -> Self {
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
    fn get_combined_range(children: &SyntaxNodeChildren) -> Option<Range<usize>> {
        let binding = match children {
            SyntaxNodeChildren::Children(children) => {
                children.iter().map(|v| v.range()).collect::<Vec<_>>()
            }
            SyntaxNodeChildren::NewRows(_) => vec![],
            SyntaxNodeChildren::Leaf(child) => vec![child.range()],
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
