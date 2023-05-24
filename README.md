# [Aftermath Editor](https://stefnotch.github.io/aftermath-editor)

<!-- Picture goes here instead of title -->

> _A natural math editor that understands your formulas._

## Why?

There are a lot of existing formula editors out there, but none of them solved my problems:

- I want to be able to input formulas _naturally_, without having to learn to read and write a new syntax. This means that I want to be able to write `1/2` and have it be a fraction $\frac{1}{2}$.
- I want to build a calculator on top of it, so the editor should understand the _semantics_ of the formulas. For example, the formulas $ax^4 + bx^3 + cx^2 +dx + e = 0$ and $\frac{d}{dx} e^x = e^x$ both have a $dx$ and a $e$ in them. Yet, in the first formula, $dx$ is a coefficient and $e$ is a constant, while in the second formula, $dx$ is a differential and $e$ is Euler's number.
- I really miss my favourite IDE features, such as autocomplete, syntax checking, documentation popups and more.

Thus, the goals are

1. Nailing down the meaning of every equation. No more guessing how a computer or a fellow human might interpret it.
2. Inputting and editing a formula should be as easy and fast as reasonably possible.
3. Beautiful rendering, following the lead of industry standard LaTeX and MathML.

## How do I use it?

[Demo](https://stefnotch.github.io/aftermath-editor)

## How does it work?

The editor is built on top of [MathML Core](https://developer.mozilla.org/en-US/docs/Web/MathML). MathML is a standard for _rendering_ mathematical formulas on the web. It is a tree-structure that can be embedded in HTML, and then the browser will display it as a pretty formula.

This is an ideal choice for an editor, since MathML gives us a standardized representation, fast and browser-native rendering and importantly accessibility.

The editor web component has a few parts under the hood.

First, it uses a simple tree data structure for the user input. That input tree is somewhat similar to MathML, but is more suited for _editing_ formulas. Keyboard and mouse input events are then used to modify the tree.

Then, that input tree is parsed into an concrete syntax tree, which has all the semantics. The concrete syntax tree can then optionally get transformed, which lets one implement difficult parsing rules.

Finally, the concrete syntax tree is used to render the formula as MathML.

More info can be found in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Features

<!-- Links to examples go here -->

- [Planned features](https://github.com/users/stefnotch/projects/1/views/1)
- Fractions
- Matrices
- ...

## Differences between this and ...?

- MathLive is a WYSIWYG LaTeX math editor, and as such, [prioritizes handling any technically valid LaTeX](https://github.com/arnog/mathlive/issues/1846#issuecomment-1442619914). This editor however only tries to handle valid, meaningful mathematics.
