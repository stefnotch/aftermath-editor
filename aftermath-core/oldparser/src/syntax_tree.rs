mod display_syntax_tree;
mod node_identifier;
mod syntax_node;

pub use display_syntax_tree::*;
pub use node_identifier::*;
pub use syntax_node::*;

pub fn get_child_range_end(children: &[SyntaxNode]) -> usize {
    assert!(children.len() > 0);
    children.last().unwrap().range().end
}
