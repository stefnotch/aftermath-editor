#[derive(Debug, PartialEq, Eq)]
pub struct LayoutZipper<'a, Value, ParentZipper: 'a + HasParent> {
    value: Value,
    parent: Option<&'a ParentZipper>,
    // get children

    // get parent

    // get root
}

pub trait HasParent {
    type Parent;
    fn parent(&self) -> Option<&Self::Parent>;
}

pub struct NoParent {}
impl HasParent for NoParent {
    type Parent = ();
    fn parent(&self) -> Option<&Self::Parent> {
        None
    }
}

/// Root implementation
impl LayoutZipper<'_, LayoutRow, NoParent> {
    pub fn new(value: LayoutRow) -> Self {
        LayoutZipper {
            value,
            parent: None,
        }
    }
}

impl<V, P> LayoutZipper<'_, V, P>
where
    P: HasParent,
{
    pub fn value(&self) -> &V {
        &self.value
    }

    pub fn parent(&self) -> Option<&P> {
        self.parent
    }

    pub fn root(&self) -> &LayoutZipper<'_, LayoutRow, NoParent> {
        let mut current = self;
        while let Some(parent) = current.parent {
            current = parent;
        }
        match self.parent {
            Some(parent) => parent.root(),
            None => self,
        }
    }
}

pub trait ChildRow {
    type Row;
    fn child_row(&self, index: usize) -> &Self::Row;
    fn child_row_count(&self) -> usize;
}
/*
impl ChildRow for LayoutElement {
    fn child_row(&self, index: usize) -> &Self::Row {
        match self {
            LayoutElement::Fraction(rows) => rows[index],
            LayoutElement::Root(rows) => rows[index],
            LayoutElement::Under(rows) => rows[index],
            LayoutElement::Over(rows) => rows[index],
            LayoutElement::Sup(rows) => rows[index],
            LayoutElement::Sub(rows) => rows[index],
            LayoutElement::Text(rows) => rows[index],
            LayoutElement::Table(table) => table.rows[index],
            LayoutElement::Symbol(_) => panic!("Symbol has no child rows"),
            LayoutElement::Bracket(_) => panic!("Bracket has no child rows"),
            LayoutElement::Error(_) => panic!("Error has no child rows"),
        }
    }
    fn child_row_count(&self) -> usize {
        match self {
            LayoutElement::Fraction(rows) => rows.len(),
            LayoutElement::Root(rows) => rows.len(),
            LayoutElement::Under(rows) => rows.len(),
            LayoutElement::Over(rows) => rows.len(),
            LayoutElement::Sup(rows) => rows.len(),
            LayoutElement::Sub(rows) => rows.len(),
            LayoutElement::Text(rows) => rows.len(),
            LayoutElement::Table(table) => table.rows.len(),
            LayoutElement::Symbol(_) => 0,
            LayoutElement::Bracket(_) => 0,
            LayoutElement::Error(_) => 0,
        }
    }
}
*/

pub struct Zipper<'a> {
    context_with_value: ZipperContext<'a>,
}

impl<'a> Zipper<'a> {
    pub fn new(value: LayoutRow<LayoutMathElement>) -> Self {
        Zipper {
            context_with_value: ZipperContext::Math(ZipperMathContext::ContextRoot(
                ZipperContextValue {
                    parent_context: &ZipperContext::Root,
                    index_in_parent: 0, // doesn't matter
                    context_value: [value],
                    value_index: 0,
                    phantom: std::marker::PhantomData,
                },
            )),
        }
    }
}

/// Heterogeneous zipper context
pub enum ZipperContext<'a> {
    Root,
    Math(ZipperMathContext<'a>),
    Text(ZipperTextContext<'a>),
    Table(ZipperTableContext<'a>),
}

pub enum ZipperMathContext<'a> {
    ContextRoot(
        ZipperContextValue<'a, [LayoutRow<LayoutMathElement>; 1], LayoutRow<LayoutMathElement>>,
    ),
    Row(ZipperContextValue<'a, LayoutRow<LayoutMathElement>, LayoutMathElement>),
    Fraction(
        ZipperContextValue<'a, [LayoutRow<LayoutMathElement>; 2], LayoutRow<LayoutMathElement>>,
    ),
    Root(ZipperContextValue<'a, [LayoutRow<LayoutMathElement>; 2], LayoutRow<LayoutMathElement>>),
    Under(ZipperContextValue<'a, [LayoutRow<LayoutMathElement>; 2], LayoutRow<LayoutMathElement>>),
    Over(ZipperContextValue<'a, [LayoutRow<LayoutMathElement>; 2], LayoutRow<LayoutMathElement>>),
    Sup(ZipperContextValue<'a, LayoutRow<LayoutMathElement>, LayoutMathElement>),
    Sub(ZipperContextValue<'a, LayoutRow<LayoutMathElement>, LayoutMathElement>),
    Text(ZipperContextValue<'a, LayoutRow<LayoutTextElement>, LayoutTextElement>),
    Table(ZipperContextValue<'a, TableContainer, LayoutTableElement>),
    // symbols aren't a valid context, instead you'd focus on a row and set the value index to a symbol
}

pub enum ZipperTextContext<'a> {
    ContextRoot(
        ZipperContextValue<'a, [LayoutRow<LayoutTextElement>; 1], LayoutRow<LayoutTextElement>>,
    ),
    Character(ZipperContextValue<'a, LayoutRow<LayoutTextElement>, LayoutTextElement>),
}
pub enum ZipperTableContext<'a> {
    ContextRoot(
        ZipperContextValue<'a, [LayoutRow<LayoutTableElement>; 1], LayoutRow<LayoutTableElement>>,
    ),
    TableCell(ZipperContextValue<'a, LayoutRow<LayoutTableElement>, LayoutTableElement>),
}

pub struct ZipperContextValue<'a, T, U> {
    parent_context: &'a ZipperContext<'a>,
    index_in_parent: usize,
    context_value: T,
    value_index: usize,
    phantom: std::marker::PhantomData<&'a U>,
}

/*
// TODO: What if I want to constrain it to only point at certain values
// (constrain it to values with a trait)
pub struct Zipper {
    context_with_value: ZipperContext,
}

pub enum ZipperContext {
    Root(LayoutRow<LayoutElement>),
    LayoutElementRow(LayoutElement),
    LayoutFractionElement(LayoutRow<LayoutElement>),
    /// ..
    LayoutText(LayoutRow<LayoutTextElement>),
    LayoutTextRow(LayoutTextElement),
    // ...
    LayoutTable(LayoutRow<LayoutTableElement>),
    LayoutTableElement(LayoutRow<LayoutElement>),
    // symbols don't appear in the context
}
 */
