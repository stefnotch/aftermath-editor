# Aftermath Core

Written in Rust

## `input_tree`

The basic data structure of the library. It stores the raw user input.

## `parser`

Parses the input tree into a syntax tree. Uses a pratt parser.

## `parse_rules`

The rules used by the parser. They are grouped into modules, such as core rules, function rules, calculus rules, string rules, etc.
Each module gets registered with the parser, and then at runtime, a subset of the modules can be used for parsing.

## `serialization`

Serializes the input tree or the syntax tree into a string. For example, serializing the input tree into a JSON string.

## `caret`

The math editor logic, including the caret position, the caret selection, and the caret movement.
Also includes editing logic, such as inserting and deleting characters.

## `web`

Exported bindings for the web.

A website will create a few shared parse modules, then create parsers from the parse modules, and finally use the parsers for math editors.
e.g.
A website can have 5 math editors, 3 of them are using the default parser.
One is using a parser with an advanced calculus module, and another is using a parser with a logic module.

The `npm run build` command recreates the bindings. It's a tad complex, due to issues [like this one](https://github.com/rustwasm/wasm-pack/issues/642).
