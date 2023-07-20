use std::fmt;

pub fn write_with_escaped_double_quotes(value: &str, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    for c in value.chars() {
        match c {
            '"' => write!(f, "\\\"")?,
            '\\' => write!(f, "\\\\")?,
            _ => write!(f, "{}", c)?,
        }
    }
    Ok(())
}

pub fn write_with_separator(
    values: impl IntoIterator<Item = impl fmt::Display>,
    separator: &str,
    f: &mut fmt::Formatter<'_>,
) -> fmt::Result {
    let mut values = values.into_iter();
    if let Some(first) = values.next() {
        write!(f, "{}", first)?;
        for value in values {
            write!(f, "{}{}", separator, value)?;
        }
    }
    Ok(())
}
