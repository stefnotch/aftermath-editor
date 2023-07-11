import { type SyntaxNode, getRowNode, hasSyntaxNodeChildren, joinNodeIdentifier } from "../core";
import type { InputRowPosition } from "../input-position/input-row-position";
import { InputRowRange } from "../input-position/input-row-range";
import type { Offset } from "../input-tree/input-offset";
import { RowIndices } from "../input-tree/row-indices";
import { assert } from "../utils/assert";

export function getLineAtPosition(caret: InputRowPosition): InputRowRange {
  return new InputRowRange(caret.zipper, 0, caret.zipper.children.length);
}

/**
 * Gets the token that the caret is in the middle of,
 * or a token that is to the left of the caret.
 */
export function getTokenAtPosition(syntaxTree: SyntaxNode, caret: InputRowPosition): InputRowRange {
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

/**
 * Gets all tokens at the caret position, or before the caret position.
 * TODO: This can be pretty inefficient.
 */
export function getAutocompleteTokens(syntaxTree: SyntaxNode, caret: InputRowPosition): InputRowRange[] {
  if (caret.offset === 0) {
    return [new InputRowRange(caret.zipper, 0, 0)];
  }

  function getAutocompleteTokensRecursive(node: SyntaxNode, endOffset: Offset): InputRowRange[] {
    if (node.range.start >= endOffset) {
      return [];
    }

    if (hasSyntaxNodeChildren(node, "Containers")) {
      return node.children.Containers.flatMap((node) => getAutocompleteTokensRecursive(node, endOffset));
    } else if (hasSyntaxNodeChildren(node, "Leaf") || hasSyntaxNodeChildren(node, "NewRows")) {
      return [new InputRowRange(caret.zipper, node.range.start, node.range.end)];
    } else {
      throw new Error("Unexpected row type " + joinNodeIdentifier(node.name));
    }
  }

  // We walk down the indices, so we should be at the row we want.
  const row = getRowNode(syntaxTree, RowIndices.fromZipper(caret.zipper));
  return getAutocompleteTokensRecursive(row, caret.offset);
}
