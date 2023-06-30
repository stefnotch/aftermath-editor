/*

There are multiple types of autocompletions and shortcuts:

- Keyboard shortcuts: Shortcuts that are triggered by a key combination, such as `Ctrl + C` for copying or `Ctrl + Z` for undo.
- Symbol shortcuts: Shortcuts that are triggered by typing in text, and the parser reporting that the text is a shortcut, such as `/` being a fraction shortcut.
- Suggested autocomplete: Autocompletions that are triggered by typing a string, such as `\sqr` to insert a square root or `Leftrightarrow` to insert the $\Leftrightarrow$ symbol.

Autocompletions can be accepted using the `Tab` and `Enter` keys.
Autocompletions can be rejected using the `Escape` or Arrow keys.

*/

// TODO: Autocomplete logic
// - Fraction is handled by
//   1. detecting the fraction autocomplete being applicable (very eagerly)
//   2. using the current parsed info (e.g. 1/2) to determine what has to go on top of the fraction
//   3. replacing the content

/*

sum gets rendered as a \sum
and when I do sum_, it actually turns into the unicode sum symbol
similar stuff for => being rendered as \rarr, and turning into the unicode symbol
- it turns into a unicode symbol as soon as it's certain that this must be the correct token. As in, the tokenizer at that point cannot accept more symbols.
e.g. known commands are lim and limsup. I type lim. Tokenizer says "lim is a token, but we could have something else". I type lim_ . Tokenizer says "lim is a token, and lim_ can definitely not lead to a valid token." I type limsu. Tokenizer says "lim is a token, but limsu can lead to a valid token."


paste: text gets inserted, special symbols like / get turned into fractions, carets land at end
symbol: carets land after symbol (depending on the symbol of course)


how to "special symbols get turned into ..."?
Multiple types of special symbols:
- /^_
- sum, lim, greekA, ...
- =>, /=, ...

Variants:
- all special symbols VS. only edited special symbols
  - A: Only edited, because we don't want $1 \text{"and/or"} 2$ to explode into a fraction as soon as the user types a quote in the wrong place $\text{"1 "}and/or\text{" 2}$
- enter to submit VS. automatically
  - automatically only for single character symbols VS as soon as it cannot be anything else
  - how would /= behave?
  

Mathlive =>=>=>=> behaves oddly



=>   =>


sum: should at some point turn in a sum symbol, so that we don't have to hit backspace three times

infty


in -> converted to \in when clicking away (but not when clicking into the currently edited stuff)
in^ -> converted as soon as one other symbol is inputted and no other tokenisation would be possible


infty
-----
infty symbol in the autocomplete popup



mathlive is confusing with its eager autoconverting, since it's not obvious that you can enter more characters (in  infty)


*/
