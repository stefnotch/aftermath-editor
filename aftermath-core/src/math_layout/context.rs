pub struct Context<T> {
    pub root: Row<T>,
}

pub struct Row<T> {
    pub values: Vec<RowElement<T>>,
}

pub struct RowElement<T, const ChildCount: usize> {
    children: [Row<T>; ChildCount],
}
