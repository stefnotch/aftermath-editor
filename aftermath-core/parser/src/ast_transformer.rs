use crate::syntax_tree::SyntaxNodes;

use super::SyntaxNode;

// TODO: Move to Typescript side
pub struct AstTransformer {
    transformations: Vec<AstTransformation>,
}
impl AstTransformer {
    pub fn transform(&self, mut parse_result: SyntaxNode) -> SyntaxNode {
        parse_result.children = match parse_result.children {
            SyntaxNodes::Containers(children) => SyntaxNodes::Containers(
                children
                    .into_iter()
                    .map(|child| self.transform(child))
                    .collect(),
            ),
            v => v,
        };

        for transformation in self.transformations.iter() {
            parse_result = (transformation.transform)(parse_result);
        }

        parse_result
    }

    pub fn new() -> Self {
        Self {
            // TODO: With long enough lists, this will overflow the stack
            // Default hardcoded tuple flattening transformation
            transformations: vec![AstTransformation {
                transform: |mut node: SyntaxNode| {
                    if node.name == "Tuple" {
                        node.children = match node.children {
                            SyntaxNodes::Containers(children) => SyntaxNodes::Containers(
                                children
                                    .into_iter()
                                    .flat_map(|child| match child.children {
                                        SyntaxNodes::Containers(inner_nodes)
                                            if child.name == "Tuple" =>
                                        {
                                            inner_nodes
                                        }
                                        _ => vec![child],
                                    })
                                    .collect(),
                            ),
                            v => v,
                        };
                    }
                    node
                },
            }],
        }
    }
}

pub struct AstTransformation {
    transform: fn(SyntaxNode) -> SyntaxNode,
}
