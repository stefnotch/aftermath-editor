import { SyntaxNode, getRowNode, hasSyntaxNodeChildren, joinNodeIdentifier } from "../../core";
import { InputRowPosition } from "../../input-position/input-row-position";
import { InputRowRange } from "../../input-position/input-row-range";
import { InputNode } from "../../input-tree/input-node";
import { InputRowZipper } from "../../input-tree/input-zipper";
import { InputRow } from "../../input-tree/row";
import { RowIndices } from "../../input-tree/row-indices";
import { assert } from "../../utils/assert";

export class CaretAutocomplete {
  constructor(public readonly currentToken: InputRowRange, public readonly caret: InputRowPosition) {}

  static fromCaret(syntaxTree: SyntaxNode, caret: InputRowPosition) {
    const tokenAtCaret = getTokenAtCaret(syntaxTree, caret);

    return new CaretAutocomplete(tokenAtCaret, caret);
  }

  // TODO: Use symbols for autocomplete
  getAutocompleteNodes(): InputNode[] {
    return this.currentToken.zipper.value.values.slice(this.currentToken.start, this.caret.end);
  }
}

/**
 * Gets the token that the caret is in the middle of,
 * or a token that is to the left of the caret.
 */
function getTokenAtCaret(syntaxTree: SyntaxNode, caret: InputRowPosition): InputRowRange {
  // We walk down the indices, so we should be at the row we want.
  const indices = RowIndices.fromZipper(caret.zipper);
  const row = getRowNode(syntaxTree, indices);

  if (caret.offset === 0) {
    return new InputRowRange(caret.zipper, 0, 0);
  }

  if (hasSyntaxNodeChildren(row, "Containers")) {
    // The row has further children, so we gotta inspect those.
    let node: SyntaxNode = row;
    while (hasSyntaxNodeChildren(node, "Containers")) {
      // Caret inside or to the left of the child
      let newNode = node.children.Containers.find(
        (child) => child.range.start < caret.offset && caret.offset <= child.range.end
      );
      if (newNode) {
        node = newNode;
      } else {
        break;
      }
    }
    return new InputRowRange(caret.zipper, node.range.start, node.range.end);
  } else if (hasSyntaxNodeChildren(row, "Leaf")) {
    return new InputRowRange(caret.zipper, row.range.start, row.range.end);
  } else if (hasSyntaxNodeChildren(row, "NewRows")) {
    assert(row.range.start === caret.offset || row.range.end === caret.offset);
    return new InputRowRange(caret.zipper, row.range.start, row.range.end);
  } else {
    throw new Error("Unexpected row type " + joinNodeIdentifier(row.name));
  }
}

/*
Caret click:
- get token(s) at caret = range
- do autocomplete with range that only goes until where the caret is (think: it's possible to click in the middle of a token)

Autocomplete tokens are separate from normal tokens. Like sum, =>, etc are not tokens that the parser can normally encounter and deal with.
So I could treat them separately!
1. Match til end with normal & autocomplete
2. If not til end: add longest entries to autocomplete result. Restart at 1.
3. If til end: try parsing again, but only with autocomplete tokens and accept partial matches. The partial matches must go until the end.

*/

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
