pub trait Invertible {
    type Inverse: Invertible;
    fn inverse(&self) -> Self::Inverse;
}
