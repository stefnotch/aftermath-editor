use super::SyntaxNode;

// TODO: Move to Typescript side
pub struct AstTransformer {
    transformations: Vec<AstTransformation>,
}
impl AstTransformer {
    pub fn transform(&self, mut parse_result: SyntaxNode) -> SyntaxNode {
        // TODO: Rewrite this to be iterative

        parse_result = match parse_result {
            SyntaxNode::Container(mut node) => {
                node.children = node
                    .children
                    .into_iter()
                    .map(|child| self.transform(child))
                    .collect();
                SyntaxNode::Container(node)
            }
            node => node,
        };

        for transformation in self.transformations.iter() {
            parse_result = (transformation.transform)(parse_result);
        }

        parse_result
    }

    pub fn new() -> Self {
        Self {
            // Default hardcoded tuple flattening transformation
            transformations: vec![AstTransformation {
                transform: |v: SyntaxNode| match v {
                    SyntaxNode::Container(mut node) if node.name == "Tuple" => {
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
                        SyntaxNode::Container(node)
                    }
                    node => node,
                },
            }],
        }
    }
}

pub struct AstTransformation {
    transform: fn(SyntaxNode) -> SyntaxNode,
}
