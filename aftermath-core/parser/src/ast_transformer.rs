use std::collections::VecDeque;

use super::MathSemantic;

// TODO: write implementation
pub struct AstTransformer {
    transformations: Vec<AstTransformation>,
}
impl AstTransformer {
    pub fn transform(&self, mut parse_result: MathSemantic) -> MathSemantic {
        // TODO: Rewrite this to be iterative

        parse_result.args = parse_result
            .args
            .into_iter()
            .map(|child| self.transform(child))
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
                transform: |mut v: MathSemantic| {
                    if v.name == "Tuple" {
                        v.args = v
                            .args
                            .into_iter()
                            .flat_map(|x| {
                                if x.name == "Tuple" {
                                    x.args.into_iter()
                                } else {
                                    vec![x].into_iter()
                                }
                            })
                            .collect();
                    }
                    v
                },
            }],
        }
    }
}

pub struct AstTransformation {
    transform: fn(MathSemantic) -> MathSemantic,
}
