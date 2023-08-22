use chumsky::{extra::Err, pratt::*, prelude::*};
//use parser::{SyntaxLeafNode, SyntaxNode};

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

/*
#[derive(Debug)]
struct SyntaxNode {
    name: String,
    range: std::ops::Range<usize>,
    children: Vec<SyntaxNode>,
}

fn parser<'a>() -> impl Parser<'a, &'a str, SyntaxNode> {
    let atom = just("cat")
        .map_with_span(|node, span: SimpleSpan| SyntaxNode {
            name: "cat".into(),
            range: span.into_range(),
            children: vec![],
        })
        .boxed();

    let operator = choice((prefix(just("+"), 1, |v| SyntaxNode {
        name: "cat".into(),
        range: todo!(),
        children: vec![v],
    }),));
    let expr = atom.pratt(operator);
    expr
}

#[test]
fn test_parser() {
    let input = "cat";

    match parser().parse(input).into_result() {
        Ok(ast) => println!("{:?}", ast),
        Err(errs) => errs.into_iter().for_each(|e| println!("{:?}", e)),
    };
}
*/

#[derive(Debug)]
struct SyntaxNode {
    name: String,
    range: std::ops::Range<usize>,
    children: Vec<SyntaxNode>,
}

fn parser<'a>() -> impl Parser<'a, &'a str, SyntaxNode, Err<Simple<'a, char>>> {
    let atom = just("cat")
        .map_with_span(|v: &str, span: SimpleSpan| SyntaxNode {
            name: v.to_string(),
            range: span.into_range(),
            children: vec![],
        })
        .boxed();

    let operator = choice((
        left_infix(just('+'), 0, |l, r| SyntaxNode {
            name: "+".to_string(),
            range: todo!(),
            children: vec![],
        }),
        left_infix(just('-'), 0, |l, r| SyntaxNode {
            name: "+".to_string(),
            range: todo!(),
            children: vec![],
        }),
        right_infix(just('*'), 1, |l, r| SyntaxNode {
            name: "+".to_string(),
            range: todo!(),
            children: vec![],
        }),
        right_infix(just('/'), 1, |l, r| SyntaxNode {
            name: "+".to_string(),
            range: todo!(),
            children: vec![],
        })
        .map_with_span(|v, span| v),
    ))
    .map_with_span(|v, span| v);

    atom.pratt(operator).map(|x| x)
}

fn complete_parser<'a>() -> impl Parser<'a, &'a str, SyntaxNode, Err<Simple<'a, char>>> {
    parser().then_ignore(end())
}

fn parse(input: &str) -> ParseResult<SyntaxNode, Simple<char>> {
    complete_parser().parse(input)
}
fn parse_partial(input: &str) -> ParseResult<SyntaxNode, Simple<char>> {
    parser().lazy().parse(input)
}

#[test]
fn complex_nesting() {
    println!("{:?}", parse_partial("1+2*3/4*5-6*7+8-9+10").into_result());
}
