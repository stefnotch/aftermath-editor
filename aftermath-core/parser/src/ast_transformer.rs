use super::{SyntaxContainerNode, SyntaxNode};

// TODO: Move to Typescript side
pub struct AstTransformer {
    transformations: Vec<AstTransformation>,
}
impl AstTransformer {
    pub fn transform(&self, mut parse_result: SyntaxContainerNode) -> SyntaxContainerNode {
        // TODO: Rewrite this to be iterative

        parse_result.children = parse_result
            .children
            .into_iter()
            .map(|child| match child {
                SyntaxNode::Container(node) => SyntaxNode::Container(self.transform(node)),
                node => node,
            })
            .collect();

        for transformation in self.transformations.iter() {
            parse_result = (transformation.transform)(parse_result);
        }

        parse_result
    }

    pub fn new() -> Self {
        Self {
            // Default hardcoded tuple flattening transformation
            transformations: vec![AstTransformation {
                transform: |mut node: SyntaxContainerNode| {
                    if node.name == "Tuple" {
                        node.children = node
                            .children
                            .into_iter()
                            .flat_map(|x| match x {
                                SyntaxNode::Container(inner_node) if inner_node.name == "Tuple" => {
                                    inner_node.children.into_iter()
                                }
                                inner_node => vec![inner_node].into_iter(),
                            })
                            .collect();
                    }
                    node
                },
            }],
        }
    }
}

pub struct AstTransformation {
    transform: fn(SyntaxContainerNode) -> SyntaxContainerNode,
}
