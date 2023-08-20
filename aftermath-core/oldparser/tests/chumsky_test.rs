use chumsky::{pratt::*, prelude::*};
use input_tree::node::InputNode;
use parser::{SyntaxLeafNode, SyntaxNode};

/*
Could be used in conjunction with a "instruction transformer"
#[derive(Debug)]
pub enum SyntaxTreeInstruction {
    StartNewRows { width: usize, height: usize },
    EndNewRows,
    StartChildren,
    EndChildren,
    Append(SyntaxNode),
    Leaf(SyntaxLeafNode),
} */

fn parser<'a>() -> impl Parser<'a, &'a [InputNode], SyntaxTreeInstruction> {
    let atom = choice(vec![
        just(InputNode::Symbol("cat".into()))
            .map(|node| SyntaxTreeInstruction::StartChildren)
            .boxed(),
        just(InputNode::Symbol("dog".into()))
            .map(|node| SyntaxTreeInstruction::StartChildren)
            .boxed(),
    ]);

    let operator = choice((
        left_infix(just(InputNode::Symbol("+".into())), 1, |l, r| {
            SyntaxTreeInstruction::StartChildren
        }),
        left_infix(just(InputNode::Symbol("-".into())), 1, |l, r| {
            SyntaxTreeInstruction::StartChildren
        }),
    ));
    let expr = atom.pratt(operator);
    expr
}

#[test]
fn test_parser() {
    let input = InputNode::symbols(vec!["l", "i"]);

    match parser().parse(input.as_slice()).into_result() {
        Ok(ast) => println!("{:?}", ast),
        Err(errs) => errs.into_iter().for_each(|e| println!("{:?}", e)),
    };
}
