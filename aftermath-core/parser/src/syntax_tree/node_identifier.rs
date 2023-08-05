use std::fmt;

use input_tree::print_helpers::write_with_separator;
use serde::Serialize;
use unicode_ident::{is_xid_continue, is_xid_start};

/// A fully qualified identifier, starting with a namespace and ending with a name.
/// Must be valid identifiers, as specified by https://www.unicode.org/reports/tr31/.
#[derive(Debug, Serialize, Clone, Eq, PartialEq, Hash)]
pub struct NodeIdentifier(Vec<String>);

impl NodeIdentifier {
    pub fn new(name: Vec<String>) -> Self {
        assert!(
            name.len() > 1,
            "A node identifier must have at least a namespace and a name"
        );

        name.iter().for_each(|v| {
            assert!(
                is_identifier(v),
                "A node identifier must only contain valid Unicode identifiers"
            )
        });

        Self(name)
    }
}

fn is_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    chars.next().filter(|c| is_xid_start(*c)).is_some() && chars.all(|c| is_xid_continue(c))
}

impl fmt::Display for NodeIdentifier {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write_with_separator(&self.0, "::", f)
    }
}
