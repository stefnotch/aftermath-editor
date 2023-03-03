pub mod element;
pub mod row;
pub mod zipper;

/*
#[derive(Debug, Clone, PartialEq, Eq, Ord, PartialOrd)]
pub struct Offset(usize);

pub trait CaretPositions {
    fn max_caret_position(&self) -> Offset;
}

//pub struct LayoutCaret {}

// A zipper accepts children that implement specific traits!
pub trait Zipper {
    type Value;
    type Parent: Zipper;
    fn value(&self) -> &Self::Value;
    fn parent(&self) -> Option<&Self::Parent>;
    //fn root(&self) -> &'a Self;
}

pub enum LayoutRowZipperContainer<'a> {
    None,
    Fraction(fraction element zipper goes here),
    Root,
    Under,
    Over,
    Sup,
    Sub,
    Text,
    Table,
    // Important: This does not have symbols or brackets, because they are not containers
}

pub struct LayoutRowZipper<'a, T> {
    value: LayoutRow<T>,
    parent: &'a LayoutRowZipperContainer<'a>,
    index_in_parent: usize,
    // TODO: Functions
    // - serialize, deserialize (only makes sense for LayoutZipper)
    // - replaceValue(value: LayoutRow), replaceChild(index, newValue), insert(offset), remove(index)
    // - get value
    // - get parent
    // - get children values
    // - get children zipper
    //   - get adjacent zipper

    // - offset and index are closely linked
    // - caret positions (easy when its actually an offset)
}

 impl<'a> LayoutRowZipper<'a, LayoutTextElement> {
    // get children (because the LayoutTextElement has text children, so it's a different type)
    fn get_children(&self) -> Vec<LayoutTextElementZipper<'a>> {
        self.value.values.iter().map(|value| LayoutTextElementZipper {
            value: value.clone(),
            parent: self,
        }).collect()
    }
}

// Enum or struct?
pub enum LayoutElementZipper {}
pub enum LayoutTextElementZipper {}

pub struct LayoutChildZipper<'a> {
    value: LayoutElement,
    parent: &'a LayoutZipper<'a>,
}

impl<'a> Zipper for LayoutZipper<'a> {
    type Value = LayoutRow;
    type Parent = LayoutZipper<'a>;
    fn value(&self) -> &Self::Value {
        &self.value
    }
    fn parent(&self) -> Option<&Self::Parent> {
        self.parent
    }
}

impl LayoutZipper<'_> {
    pub fn new(value: LayoutRow) -> Self {
        LayoutZipper {
            value,
            parent: None,
        }
    }
}

pub struct LayoutIndex<'a, T> {
    // TODO: Not sure if this is the best way to do this,
    // maybe using a trait for the zipper is better in this case?
    zipper: LayoutRowZipper<'a, T>,
    index: usize,
}
pub struct LayoutOffset<'a, T> {
    zipper: LayoutRowZipper<'a, T>,
    offset: Offset,
    // TODO: Getter for left and right index/offset
}
 */
