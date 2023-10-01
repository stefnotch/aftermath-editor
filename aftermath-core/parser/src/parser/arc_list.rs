use std::sync::Arc;

pub enum ArcList<T> {
    Empty,
    Cons(T, Arc<ArcList<T>>),
}

impl<T> Default for ArcList<T> {
    fn default() -> Self {
        Self::Empty
    }
}

impl<T> ArcList<T> {
    pub fn iter(&self) -> ArcListIter<T> {
        ArcListIter {
            list: self,
            index: 0,
        }
    }
}

pub struct ArcListIter<'a, T> {
    list: &'a ArcList<T>,
    index: usize,
}

impl<'a, T> Iterator for ArcListIter<'a, T> {
    type Item = &'a T;

    fn next(&mut self) -> Option<Self::Item> {
        match self.list {
            ArcList::Empty => None,
            ArcList::Cons(v, next) => {
                self.list = next;
                self.index += 1;
                Some(v)
            }
        }
    }
}
