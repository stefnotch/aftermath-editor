import { SyntaxNode, getRowNode, hasSyntaxNodeChildren, joinNodeIdentifier } from "../../core";
import { MathLayoutEdit, MathLayoutSimpleEdit } from "../../editing/input-tree-edit";
import { InputRowPosition } from "../../input-position/input-row-position";
import { InputTree } from "../../input-tree/input-tree";
import { RowIndices } from "../../input-tree/row-indices";
import { RenderResult } from "../../rendering/render-result";
import { assert, assertUnreachable } from "../../utils/assert";
import { CaretDomElement } from "./single-caret-element";
import { getSharedCaret, moveCaret } from "./math-layout-caret";
import { removeAtCaret } from "./math-layout-caret-edit";
import { InputNode, InputNodeContainer } from "../../input-tree/input-node";
import { InputRowRange } from "../../input-position/input-row-range";
import { SerializedCaret } from "./serialized-caret";
/*
undo -> save carets -> (finish carets) -> create old carets, including the old #currentTokens
redo -> save carets -> (finish carets) -> create old carets, including the old #currentTokens
=> SerializedCaret includes more info

finish carets -> if edited, forcibly apply "selected && perfect match" autocompletions (by default the top autocompletion is selected)

drag ->
  assert state is selecting
  if replace: replace logic already ran
  else if add
  else if extend

click -> if carets
    if replace // default
		check target location
			if it's a known location, we copy its #currentTokens and remove the caret without finishing it
		finish carets
		add caret with #currentTokens
		
	else if add // when the user is pressing something funny like alt
		check target location
			if it's a known location, we remove the caret there without finishing it
			else if isPotentialGrid
        save start position the carets
        finish carets
        create grid with saved carets, and add new caret at target location
      else add caret
	
	else if extend // when the user is pressing shift
    copy start position and #currentTokens from the main caret
    finish carets
    add caret with start position and #currentTokens

  else if grid
    if replace
      finish carets
      switch to carets
      add caret
    if add
      
    


check new position -> finish carets -> update caret's #currentTokens


move -> behaves similar to click
add, remove -> behaves similar to click
*/

/**
 * Manages the rendering and editing of carets. There are multiple possible states.
 *
 * 1. Row selections
 * - Selecting with pointer
 * - N carets
 *
 * 2. Grid selections
 * - TODO: Implement the table selections
 */
export class MathEditorCarets {
  //
  // - move carets to the same spot (merge)
  // - select and delete region that contains a caret

  #carets: CaretAndSelection[] = [];

  #containerElement: HTMLElement;
  #syntaxTree: SyntaxNode;

  constructor(syntaxTree: SyntaxNode) {
    this.#containerElement = document.createElement("div");
    this.#containerElement.style.position = "absolute";
    this.#syntaxTree = syntaxTree;
  }

  get element() {
    return this.#containerElement;
  }

  private get mainCaret() {
    return this.#carets.at(-1) ?? null;
  }

  updateSyntaxTree(inputTree: InputTree, syntaxTree: SyntaxNode) {
    this.#syntaxTree = syntaxTree;
    const serializedCarets = this.serialize();
    this.map((caret) => caret.remove());
    this.#carets = serializedCarets.map((serializedCaret) =>
      CaretAndSelection.deserialize(this.#containerElement, inputTree, syntaxTree, serializedCaret)
    );
  }

  finishAndClearCarets() {
    this.map((caret) => caret.finishAndRemove());
    this.#carets = [];
  }

  moveCarets(direction: "up" | "down" | "left" | "right", renderResult: RenderResult<MathMLElement>) {
    this.finishPointerDown();
    this.map((caret) => {
      caret.moveCaret(this.#syntaxTree, renderResult, direction);
    });
    // TODO: Deduplicate carets/remove overlapping carets
  }

  /**
   * Finishes the current carets, and returns the edit that needs to be applied.
   */
  removeAtCarets(direction: "left" | "right", tree: InputTree, renderResult: RenderResult<MathMLElement>): MathLayoutEdit {
    this.finishPointerDown();
    const mergedEdit = {
      type: "multi" as const,
      caretsBefore: this.serialize(),
      // TODO: Deduplicate carets/remove overlapping carets
      caretsAfter: [] as SerializedCaret[],
      edits: [] as MathLayoutSimpleEdit[],
    };

    // Iterate over the ranges, and move them after every edit
    let caretRanges = this.map((caret) => caret.caret);
    while (caretRanges.length > 0) {
      const caret = caretRanges.shift();
      assert(caret);

      const edit = removeAtCaret(caret, direction, renderResult);
      mergedEdit.caretsAfter.push(edit.caret);
      mergedEdit.edits.push(...edit.edits);
      edit.edits.forEach((simpleEdit) => {
        caretRanges = tree
          .updateRangesWithEdit(
            simpleEdit,
            caretRanges.map((v) => v.range)
          )
          .map((v) => new CaretRange(v));
      });
    }

    this.finishAndClearCarets();

    return mergedEdit;
  }

  renderCarets(renderResult: RenderResult<MathMLElement>) {
    this.map((caret) => caret.renderCaret(renderResult));
  }

  startPointerDown(position: InputRowPosition) {
    this.finishAndClearCarets();
    this.#carets = {
      type: "selecting",
      caret: this.createCaret(new CaretRange(position)),
    };
  }

  isPointerDown() {
    return this.#carets.type === "selecting";
  }

  updatePointerDown(position: InputRowPosition) {
    assert(this.#carets.type === "selecting");
    this.#carets.caret.setEndPosition(this.#syntaxTree, position);
  }

  finishPointerDown() {
    if (this.#carets.type === "selecting") {
      this.#carets = {
        type: "carets",
        carets: [this.#carets.caret],
      };
    }
  }

  private deserialize(layoutCaret: CaretRange) {
    // Limited to one caret
    const newCaret = this.createCaret(layoutCaret);
    this.addAndMergeCarets(newCaret);
  }

  private serialize() {
    this.finishPointerDown();
    return this.map((v) => v.serialize());
  }

  private map<T>(fn: (caret: CaretAndSelection) => T): T[] {
    let carets: CaretAndSelection[];
    if (this.#carets.type === "selecting") {
      carets = [this.#carets.caret];
    } else if (this.#carets.type === "carets" || this.#carets.type === "grid") {
      carets = this.#carets.carets;
    } else {
      assertUnreachable(this.#carets);
    }
    return carets.map(fn);
  }

  private createCaret(caret: CaretRange, startPostion?: InputRowPosition) {
    return new CaretAndSelection(this.#containerElement, this.#syntaxTree, {
      startPosition: startPostion ?? caret.startPosition(),
      caret,
    });
  }
}

type CaretSelection =
  | {
      type: "caret";
      range: InputRowRange;
    }
  | {
      type: "grid";
      // when one de-selects a grid cell, one ends up splitting the selection into two
    };

class CaretAndSelection {
  /**
   * Where the user started the caret.
   */
  #startPosition: InputRowPosition;
  /**
   * Where the user ended the caret.
   */
  #endPosition: InputRowPosition;

  #selected: CaretSelection;

  /**
   * Range of input nodes that are currently being edited. Used for autocompletions.
   *
   * Since we're asking the SyntaxTree, we'll get info like "is currently inside a wide text token".
   * And then, no autocompletions will match.
   *
   * We also support writing "lixsup|",
   * then moving the caret to the typo, fixing it, "lim|sup"
   * and then moving the caret back to the end "limsup|".
   *
   * currentTokens is empty if there's a selection.
   *
   * - When the user clicks somewhere, we create a new caret and set the currentTokens to the token at the caret.
   *   Clicking somewhere definitely creates a new caret.
   * TODO: But what if the user clicks on an existing "currentToken"? Should that really result in a new caret and thus a new autocomplete?
   *
   * - When the user types, we
   *   1. Input the symbol (happens outside of this class)
   *   2. Extend the currentTokens
   *   3. Query the parser for autocompletions
   *   4. If there are any tokens that must be applied, we'll do that. Then we can update the currentTokens.
   */
  #currentTokens: InputRowRange | null;

  #hasEdited: boolean = false;

  // For rendering
  highlightedElements: ReadonlyArray<Element> = [];
  #element = new CaretDomElement();

  constructor(
    public container: HTMLElement,
    opts: {
      syntaxTree: SyntaxNode;
      startPosition: InputRowPosition;
      endPosition: InputRowPosition;
    }
  ) {
    this.#startPosition = opts.startPosition;
    this.#endPosition = opts.endPosition;
    this.#selected = getSelection(opts.startPosition, opts.endPosition);
    this.#currentTokens = getTokenFromSelection(opts.syntaxTree, this.#selected);
    this.#hasEdited = false;
    container.append(this.#element.element);
  }

  getAutocompleteNodes(): InputNode[] {
    if (!this.#currentTokens) {
      return [];
    }
    return this.#currentTokens.zipper.value.values.slice(this.#currentTokens.start, this.#endPosition.end);
  }

  /**
   * Note: Make sure to re-render the caret after moving it
   */
  moveCaret(syntaxTree: SyntaxNode, renderResult: RenderResult<MathMLElement>, direction: "up" | "down" | "left" | "right") {
    const newCaret = moveCaret(this.#caret, direction, renderResult);
    if (newCaret) {
      this.#caret = newCaret;
      // TODO: if newCaret outside of #currentTokens, then "finish current tokens" and "start new tokens"
      this.#currentTokens = getTokenAtPosition(syntaxTree, this.#caret.endPosition());
    }
  }

  /**
   * For mouse dragging.
   */
  setEndPosition(syntaxTree: SyntaxNode, position: InputRowPosition) {
    this.#endPosition = position;
    this.#selected = getSelection(this.#startPosition, position);
    this.#currentTokens = getTokenFromSelection(syntaxTree, this.#selected);
  }

  setHighlightedElements(elements: ReadonlyArray<Element>) {
    this.highlightedElements.forEach((v) => v.classList.remove("caret-container-highlight"));
    this.highlightedElements = elements;
    this.highlightedElements.forEach((v) => v.classList.add("caret-container-highlight"));
  }

  renderCaret(renderResult: RenderResult<MathMLElement>) {
    if (this.#selected.type === "caret") {
      const range = this.#selected.range;
      const caretIndices = RowIndices.fromZipper(range.zipper);
      const renderedCaret = renderResult.getViewportSelection({
        indices: caretIndices,
        start: range.leftOffset,
        end: range.rightOffset,
      });
      // Render caret itself
      const caretSize = renderResult.getViewportCaretSize(caretIndices);
      this.#element.setPosition(
        renderedCaret.rect.x + (range.isForwards ? renderedCaret.rect.width : 0),
        renderedCaret.baseline + caretSize * 0.1
      );
      this.#element.setHeight(caretSize);

      // Render selection
      this.#element.clearSelections();
      if (!range.isCollapsed) {
        this.#element.addSelection(renderedCaret.rect);
      }

      // Highlight container (for the caret)
      const container = renderResult.getElement(caretIndices);
      this.setHighlightedElements(container.getElements());

      // Highlight token at the caret
      if (this.#currentTokens) {
        this.#element.setToken(renderResult.getViewportSelection(this.#currentTokens.toRowIndicesAndRange()));
      } else {
        this.#element.setToken(null);
      }
    } else if (this.#selected.type === "grid") {
      console.warn("TODO: render grid selection");
    } else {
      assertUnreachable(this.#selected);
    }
  }

  serialize(): SerializedCaret {
    return new SerializedCaret(
      this.#startPosition.serialize(),
      this.#endPosition.serialize(),
      this.#selected.type === "caret" ? "caret" : "grid",
      this.#currentTokens?.serialize() ?? null,
      this.#hasEdited
    );
  }

  static deserialize(
    container: HTMLElement,
    tree: InputTree,
    syntaxTree: SyntaxNode,
    serialized: SerializedCaret
  ): CaretAndSelection {
    return new CaretAndSelection(container, {
      syntaxTree,
      startPosition: InputRowPosition.deserialize(tree, serialized.startPosition),
      endPosition: InputRowPosition.deserialize(tree, serialized.endPosition),
    });
  }

  finish() {
    if (this.#hasEdited) {
    }
  }

  remove() {
    this.container.removeChild(this.#element.element);
    this.setHighlightedElements([]);
  }
}

function getSelection(start: InputRowPosition, end: InputRowPosition): CaretSelection {
  const sharedRange = getSharedCaret(start, end);
  const isSingleElementSelected = sharedRange.start + 1 === sharedRange.end;
  if (isSingleElementSelected) {
    const selectedElement = sharedRange.zipper.value.values[sharedRange.start];
    if (selectedElement instanceof InputNodeContainer && selectedElement.containerType === "Table") {
      return {
        type: "grid",
      };
    }
  }

  return {
    type: "caret",
    range: sharedRange,
  };
}

function getTokenFromSelection(syntaxTree: SyntaxNode, caretSelection: CaretSelection): InputRowRange | null {
  if (caretSelection.type === "caret" && caretSelection.range.isCollapsed) {
    return getTokenAtPosition(syntaxTree, caretSelection.range.startPosition());
  } else {
    return null;
  }
}

/**
 * Gets the token that the caret is in the middle of,
 * or a token that is to the left of the caret.
 */
function getTokenAtPosition(syntaxTree: SyntaxNode, caret: InputRowPosition): InputRowRange {
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
