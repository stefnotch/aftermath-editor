import { SyntaxNode, getRowNode, hasSyntaxNodeChildren, joinNodeIdentifier } from "../../core";
import { MathLayoutEdit, MathLayoutSimpleEdit } from "../../editing/input-tree-edit";
import { InputRowPosition } from "../../input-position/input-row-position";
import { InputTree } from "../../input-tree/input-tree";
import { RowIndices } from "../../input-tree/row-indices";
import { RenderResult } from "../../rendering/render-result";
import { assert, assertUnreachable } from "../../utils/assert";
import { CaretDomElement } from "./caret-element";
import { CaretRange, SerializedCaret, moveCaret } from "./math-layout-caret";
import { removeAtCaret } from "./math-layout-caret-edit";
import { InputNode, InputNodeContainer } from "../../input-tree/input-node";
import { InputRowRange } from "../../input-position/input-row-range";
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
		
	else if add // when the user is pressing something funny like ctrlcheck target location
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

type CaretsState =
  | {
      type: "selecting";
      caret: CaretAndSelection;
    }
  | {
      type: "carets";
      carets: CaretAndSelection[];
    }
  | {
      type: "grid";
      carets: CaretAndSelection[];
    };

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

  #carets: CaretsState = {
    type: "carets",
    carets: [],
  };
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

  updateSyntaxTree(syntaxTree: SyntaxNode) {
    // Currently limited to one caret
    // TODO: Multi-caret support

    this.#syntaxTree = syntaxTree;
    if (this.#carets.type === "carets") {
      assert(this.#carets.carets.length <= 0);
    } else {
      assert(this.#carets.type === "grid");
      assert(this.#carets.carets.length <= 0);
    }
    // TODO: Update all carets
  }

  add(layoutCaret: CaretRange) {
    // Limited to one caret
    const newCaret = this.createCaret(layoutCaret);
    this.addAndMergeCarets(newCaret);
  }

  finishAndClearCarets() {
    this.map((caret) => caret.finishAndRemove());
    this.#carets = {
      type: "carets",
      carets: [],
    };
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

  // TODO: use this function
  isPotentialGridSelection() {
    if (this.#carets.type === "selecting") return false;
    if (this.#carets.type === "grid") return true;
    if (this.#carets.type === "carets") {
      if (this.#carets.carets.length === 0) return false;

      return this.#carets.carets.every((caret) => {
        const range = caret.caret.range;
        return (
          range.zipper.parent?.type === "Table" || // maybe also check that the range is a single cell
          range.zipper.value.values
            .slice(range.start, range.end)
            .every((v) => v instanceof InputNodeContainer && v.containerType === "Table")
        );
      });
    } else {
      assertUnreachable(this.#carets);
    }
  }

  private serialize() {
    this.finishPointerDown();
    return this.map((v) => CaretRange.serialize(v.caret));
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
      element: new CaretDomElement(),
    });
  }
}

class CaretAndSelection {
  /**
   * Where the user started the caret.
   */
  #startPosition: InputRowPosition;
  element: CaretDomElement;

  /**
   * The current caret, which may be different from the start position if the user has selected a range.
   */
  #caret: CaretRange;
  /**
   * Range of input nodes that are currently being edited. Used for autocompletions.
   *
   * Since we're asking the SyntaxTree, we'll get info like "is currently inside a wide text token".
   * And then, no autocompletions will match.
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
  #currentTokens: InputRowRange;

  #hasEdited: boolean = false;

  highlightedElements: ReadonlyArray<Element> = [];

  constructor(
    public container: HTMLElement,
    syntaxTree: SyntaxNode,
    opts: { startPosition: InputRowPosition; caret: CaretRange; element: CaretDomElement }
  ) {
    this.#startPosition = opts.startPosition;
    this.#caret = opts.caret;
    this.element = opts.element;
    this.#currentTokens = getTokenAtCaret(syntaxTree, this.#caret.endPosition());
    this.#hasEdited = false;

    container.append(this.element.element);
  }

  get caret() {
    return this.#caret;
  }

  renderCaret(renderResult: RenderResult<MathMLElement>) {
    const caretIndices = RowIndices.fromZipper(this.#caret.range.zipper);
    const renderedCaret = renderResult.getViewportSelection({
      indices: caretIndices,
      start: this.#caret.leftOffset,
      end: this.#caret.rightOffset,
    });
    // Render caret itself
    const caretSize = renderResult.getViewportCaretSize(caretIndices);
    this.element.setPosition(
      renderedCaret.rect.x + (this.#caret.isForwards ? renderedCaret.rect.width : 0),
      renderedCaret.baseline + caretSize * 0.1
    );
    this.element.setHeight(caretSize);

    // Render selection
    this.element.clearSelections();
    if (!this.#caret.isCollapsed) {
      this.element.addSelection(renderedCaret.rect);
    }

    // Highlight container (for the caret)
    const container = renderResult.getElement(caretIndices);
    this.setHighlightedElements(container.getElements());

    // Highlight token at the caret
    this.element.setToken(renderResult.getViewportSelection(this.#currentTokens.toRowIndicesAndRange()));
  }

  getAutocompleteNodes(): InputNode[] {
    return this.#currentTokens.zipper.value.values.slice(this.#currentTokens.start, this.caret.range.end);
  }

  /**
   * Note: Make sure to re-render the caret after moving it
   */
  moveCaret(syntaxTree: SyntaxNode, renderResult: RenderResult<MathMLElement>, direction: "up" | "down" | "left" | "right") {
    const newCaret = moveCaret(this.#caret, direction, renderResult);
    if (newCaret) {
      this.#caret = newCaret;
      // TODO: if newCaret outside of #currentTokens, then "finish current tokens" and "start new tokens"
      this.#currentTokens = getTokenAtCaret(syntaxTree, this.#caret.endPosition());
    }
  }

  setEndPosition(syntaxTree: SyntaxNode, position: InputRowPosition) {
    // TODO: Table selections
    this.#caret = CaretRange.getSharedCaret(this.#startPosition, position);
    // Not sure if this is needed during dragging
    this.#currentTokens = getTokenAtCaret(syntaxTree, this.#caret.endPosition());
  }

  setHighlightedElements(elements: ReadonlyArray<Element>) {
    this.highlightedElements.forEach((v) => v.classList.remove("caret-container-highlight"));
    this.highlightedElements = elements;
    this.highlightedElements.forEach((v) => v.classList.add("caret-container-highlight"));
  }

  finishAndRemove() {
    if (this.#hasEdited) {
    }

    this.container.removeChild(this.element.element);
    this.setHighlightedElements([]);
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
