use super::{
    element::{Element, MathElement, TableElement, TextElement},
    row::{Row, RowIndex},
};

// Not an enum. We might add an enum in the future to store different zipper types when needed.
pub struct RowZipperValue<'a, T>
where
    T: Element,
{
    value: &'a mut Row<T>,
    parent: Option<Box<RowZipper<'a>>>,
    index_in_parent: RowIndex,
}

pub enum RowZipper<'a> {
    Math(RowZipperValue<'a, MathElement>),
    Text(RowZipperValue<'a, TextElement>),
    Table(RowZipperValue<'a, TableElement>),
}

impl<'a, T> RowZipperValue<'a, T>
where
    T: Element,
{
    // Takes ownership of the parent
    pub fn new(value: &mut Row<T>, parent: Option<RowZipper>, index_in_parent: RowIndex) -> Self {
        RowZipperValue {
            value,
            parent: parent.map(Box::new),
            index_in_parent,
        }
    }

    // Oh my gosh Rust is so cool https://stackoverflow.com/a/28159407/3492994
    /// consumes the zipper and returns the parent zipper
    /// also constructs a parent with the changed values
    pub fn go_up(self) -> Option<RowZipper<'a>> {
        if let Some(parent) = self.parent {
            let parent = *parent;
            // TODO: Parent update, or did we already do that because we have a mutable reference?
            //(*self.value) = new_value;
            Some(parent)
        } else {
            None
        }
    }

    pub fn len(&self) -> usize {
        self.value.values.len()
    }

    pub fn element_len(&self, index: usize) -> usize {
        if index >= self.value.values.len() {
            return 0;
        }
        self.value.values[index].len()
    }
}

impl<'a> RowZipperValue<'a, MathElement> {
    /// consumes the zipper and returns the child zipper
    pub fn go_down(self, index: RowIndex) -> Option<RowZipper<'a>> {
        if index.0 >= self.value.values.len() {
            return None;
        }
        if index.1 >= self.value.values[index.0].len() {
            return None;
        }

        // I bet there's some traits way of simplifying this code
        match self.value.values[index.0] {
            MathElement::Fraction(v)
            | MathElement::Root(v)
            | MathElement::Under(v)
            | MathElement::Over(v) => Some(RowZipper::Math(RowZipperValue::new(
                &mut v[index.1],
                Some(RowZipper::Math(self)),
                index,
            ))),
            MathElement::Sup(v) | MathElement::Sub(v) => Some(RowZipper::Math(
                RowZipperValue::new(&mut v, Some(RowZipper::Math(self)), index),
            )),
            MathElement::Text(v) => Some(RowZipper::Text(RowZipperValue::new(
                &mut v,
                Some(RowZipper::Math(self)),
                index,
            ))),
            MathElement::Table { cells, row_width } => Some(RowZipper::Table(RowZipperValue::new(
                &mut cells,
                Some(RowZipper::Math(self)),
                index,
            ))),
            MathElement::Symbol(v) => None,
            MathElement::Bracket(v) => None,
            MathElement::Error(v) => None,
        }
    }

    /*
    Maybe something like this would simplify the big match statement above?
    fn make_child_at<U>(self, value: &Row<U>, index: RowZipperIndex) -> RowZipperValue<'a, U>
    where
        U: Element,
    {
        RowZipperValue::new(value, Some(RowZipper::Math(self)), index)
    }
     */
}

impl<'a> RowZipperValue<'a, TextElement> {
    /// consumes the zipper and returns the child zipper
    pub fn go_down(self, index: RowIndex) -> Option<RowZipper<'a>> {
        if index.0 >= self.value.values.len() {
            return None;
        }
        if index.1 >= self.value.values[index.0].len() {
            return None;
        }

        match self.value.values[index.0] {
            TextElement::Math(v) => Some(RowZipper::Math(RowZipperValue::new(
                &mut v,
                Some(RowZipper::Text(self)),
                index,
            ))),
            TextElement::Character(v) => None,
        }
    }
}

impl<'a> RowZipperValue<'a, TableElement> {
    /// consumes the zipper and returns the child zipper
    pub fn go_down(self, index: RowIndex) -> Option<RowZipper<'a>> {
        if index.0 >= self.value.values.len() {
            return None;
        }
        if index.1 >= self.value.values[index.0].len() {
            return None;
        }

        match self.value.values[index.0] {
            TableElement::TableCell(v) => Some(RowZipper::Math(RowZipperValue::new(
                &mut v,
                Some(RowZipper::Table(self)),
                index,
            ))),
        }
    }
}
