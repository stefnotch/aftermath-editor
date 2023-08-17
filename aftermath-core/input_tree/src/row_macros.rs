#[macro_export]
macro_rules! input_node {
  ((symbol $s:expr)) => {
    $crate::node::InputNode::symbol($s)
  };
  ((fraction $a:tt, $b:tt)) => {
      $crate::node::InputNode::fraction([$crate::input_row!($a), $crate::input_row!($b)])
  };
  ((frac $a:tt, $b:tt)) => {
      $crate::node::InputNode::fraction([$crate::input_row!($a), $crate::input_row!($b)])
  };
  ((root $a:tt, $b:tt)) => {
      $crate::node::InputNode::root([$crate::input_row!($a), $crate::input_row!($b)])
  };
  ((sup $a:tt)) => {
      $crate::node::InputNode::sup($crate::input_row!($a))
  };
  ((sub $a:tt)) => {
      $crate::node::InputNode::sub($crate::input_row!($a))
  };
  ((table $x:literal x $y:literal $e:tt $(,$es:tt)* $(,)?)) => {{
      let width: usize = $x;
      let height: usize = $y;
      let values = vec![$crate::input_row!($e), $($crate::input_row!($es)),*];
      assert!(values.len() == width * height, "Table size does not match the values");
      $crate::node::InputNode::table(values, width)
  }};
  ($s:literal) => {
    $crate::node::InputNode::symbol($s)
  };
  ($s:expr) => {
    $s
  };
}

#[macro_export]
macro_rules! input_row {
  ((row $e:tt $(,$es:tt)* $(,)?))=> {
    $crate::row::InputRow::new(vec![$crate::input_node!($e), $($crate::input_node!($es)),*])
  };
  ($e:expr) => {
      $e
  };
}
