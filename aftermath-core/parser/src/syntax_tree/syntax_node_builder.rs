use std::ops::Range;

use super::{LeafNodeType, NodeIdentifier, SyntaxLeafNode, SyntaxNode, SyntaxNodeChildren};

pub struct SyntaxNodeBuilder {
    /// children of the node, including the operator token(s)
    pub children: SyntaxNodeChildren,
    /// value, especially for constants
    /// stored as bytes, and interpreted according to the name
    pub value: Vec<u8>,
}

impl SyntaxNodeBuilder {
    pub fn new(children: SyntaxNodeChildren) -> Self {
        Self {
            children,
            value: vec![],
        }
    }

    pub fn set_value(mut self, value: Vec<u8>) -> Self {
        self.value = value;
        self
    }

    pub fn new_leaf_node(symbols: Vec<String>, node_type: LeafNodeType) -> Self {
        Self::new(SyntaxNodeChildren::Leaf(SyntaxLeafNode::new(
            node_type, symbols,
        )))
    }

    pub fn build(self, name: NodeIdentifier, range: Range<usize>) -> SyntaxNode {
        let mut node = SyntaxNode::new(name, range, self.children);
        node.value = self.value;
        node
    }
}
