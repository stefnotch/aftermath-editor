# mathml-editor

A prototype of a MathML editor. See it in action at https://stefnotch.github.io/mathml-editor

## Developer info

- `src/MathEditor.vue` contains a Vue wrapper for the mathematical editor
- `src/math-editor` contains all the code for the mathematical editor
- `src/math-editor/math-ir.ts` is the "intermediate representation" of a formula
- `src/math-editor/math-ast.ts` is the same representation plus links to parents

## Future plans

### Type Theory

- MathJson -> Typechecking -> Evaluation
- Catch errors before evaluating, like `1 + {1,2,3}` would be "error: cannot add number and set"
- Figuring out the correct _invisible_ operator, like
  - AB with A and B being vectors (vec from A to B)
  - ac with a and b being strings (concat)
  - (\x -> 3x)(x) with (\x -> 3x) being a function (apply)
  - 2x with x being a boring old value (multiply)
- Type inference for arbitrary expressions and functions
- https://en.wikipedia.org/wiki/Logical_framework
- https://en.wikipedia.org/wiki/Dependent_type#First_order_dependent_type_theory
- https://math.andrej.com/2012/11/08/how-to-implement-dependent-type-theory-i/
