# next

- Caret clicking on DOM node and resolving that location
- Highlighting container at caret
- Deleting elements
- Integrate [lil-gui](https://github.com/georgealways/lil-gui) for dev purposes
- Add rows debug rendering, see #7
- Implement undoing and redoing
- Selecting math
- Add ranges to data structure
- Simplify text representation

# v0.0.3

- Checked out Rust tooling, came to the very sad conclusion that the Rust-WASM story just isn't quite there yet. Parcel 2 doesn't support it, Vite has a 3rd party plugin that works but is slow, converting simple data structures to JS isn't as easy as it should be and that was just me getting started
- Updated tooling, removed Vue and now it's sleeker
- Refactored existing stuff to use a web component, which is nice because it finally does the cleanup stuff automatically, no longer creates random stuff right in the document.body, I can actually use CSS and setting the attribute is no longer a dirty hack
- Caret refactoring to use a zipper/red-green tree, also involved making the datastructure immutable and rewriting the movement logic
- https://github.com/stefnotch/mathml-editor/issues/13#issuecomment-1301177394
- Added table to test site
- Lots of refactors, like moving around files
