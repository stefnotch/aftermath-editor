use std::sync::Arc;

pub type ArcList<T> = Arc<ArcList_<T>>;

pub enum ArcList_<T> {
    Empty,
    Cons(T, ArcList<T>),
}

impl<T> Default for ArcList_<T> {
    fn default() -> Self {
        Self::Empty
    }
}

impl<T> ArcList_<T> {
    pub fn iter(&self) -> ArcListIter<T> {
        ArcListIter {
            list: self,
            index: 0,
        }
    }
}

pub struct ArcListIter<'a, T> {
    list: &'a ArcList_<T>,
    index: usize,
}

impl<'a, T> Iterator for ArcListIter<'a, T> {
    type Item = &'a T;

    fn next(&mut self) -> Option<Self::Item> {
        match self.list {
            ArcList_::Empty => None,
            ArcList_::Cons(v, next) => {
                self.list = next;
                self.index += 1;
                Some(v)
            }
        }
    }
}
