# next

- Copy-pasting
- Selections with double click and drag. Also with triple click.

# v0.2.3

- Add table selections
- Add parsing priority, to disambiguate between `lim` and variable names

# v0.2.2

- Render more elements, such as the infinity symbol

# v0.2.1

- Implement inserting
  - With autocorrect, like replacing >= with ≥
  - Theoretically takes multiple carets into account
- Render stretchy operators
- Basic autocomplete popup

# v0.2.0

- Refactor InputNodes to have Grids instead of simple arrays of rows.
- Reduce number of different InputNodes
- Use widths for InputNodes, so that I can work with absolute positions

# v0.1.2

- highlight token before caret

# v0.1.1

- simplistic editing
- better error reporting

# v0.1.0

- Semantics parser written in Rust, compiled to WebAssembly
- Text is no longer a first class concept, see https://github.com/stefnotch/aftermath-editor/issues/21#issuecomment-1422725139
- Deal with Unicode segmentation
- Add a custom written Regex engine
- Add a custom written Pratt parser
  - Table driven, for extensibility
  - Hopefully will be replaced by chumsky
  - Outputs a concrete syntax tree
- Concrete syntax tree has namespaced tokens for extensibility
- Rewrite renderer to use the concrete syntax tree
- Improve the documentation

# v0.0.7

- Caret clicking on DOM node and resolving that location
  - Now resolves the absolutely closest position instead of using the DOM node
- Highlighting container at caret
- Deleting elements
  - Delete at caret
  - Delete selected
- Integrate [lil-gui](https://github.com/georgealways/lil-gui) for dev purposes
- Add rows debug rendering, see #7
- Implement undoing and redoing
- Selecting math
- Add ranges to data structure
- Simplify text representation and thus simplify entire MathLayout
- Added a useless note in math-layout-edit.ts

# v0.0.3

- Checked out Rust tooling, came to the very sad conclusion that the Rust-WASM story just isn't quite there yet. Parcel 2 doesn't support it, Vite has a 3rd party plugin that works but is slow, converting simple data structures to JS isn't as easy as it should be and that was just me getting started
- Updated tooling, removed Vue and now it's sleeker
- Refactored existing stuff to use a web component, which is nice because it finally does the cleanup stuff automatically, no longer creates random stuff right in the document.body, I can actually use CSS and setting the attribute is no longer a dirty hack
- Caret refactoring to use a zipper/red-green tree, also involved making the datastructure immutable and rewriting the movement logic
- https://github.com/stefnotch/aftermath-editor/issues/13#issuecomment-1301177394
- Added table to test site
- Lots of refactors, like moving around files
