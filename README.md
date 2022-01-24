# mathml-editor

A prototype of a MathML editor. See it in action at https://stefnotch.github.io/mathml-editor

## Developer info

- `src/MathEditor.vue` contains a Vue wrapper for the mathematical editor
- `src/math-editor` contains all the code for the mathematical editor
- `src/math-editor/math-ir.ts` is the "intermediate representation" of a formula
- `src/math-editor/math-ast.ts` is the same representation plus links to parents
