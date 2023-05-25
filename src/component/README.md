# Web Component

Mainly the `math-editor.ts`. Also contains all classes that are directly useful for it, such as the caret.

## Autocomplete

There are multiple types of autocompletions and shortcuts:

- Keyboard shortcuts: Shortcuts that are triggered by a key combination, such as `Ctrl + C` for copying or `Ctrl + Z` for undo.
- Symbol shortcuts: Shortcuts that are triggered by typing in text, and the parser reporting that the text is a shortcut, such as `/` being a fraction shortcut.
  - Those shortcuts are only triggered if the text is next to the caret after an insertion.
  - If not, they're rendered as an error, and an autocompletion/error lightbulb can be opened to fix it. The autocompletion will suggest both `insert fraction` and escaping the symbol `\/`.
- Suggested autocomplete: Autocompletions that are triggered by typing a string, such as `\sqr` to insert a square root or `Leftrightarrow` to insert the $\Leftrightarrow$ symbol.

Autocompletions can be accepted using the `Tab` and `Enter` keys.
Autocompletions can be rejected using the `Escape` or Arrow keys.
