import { SyntaxNode, getRowNode, hasSyntaxNodeChildren, joinNodeIdentifier } from "../../core";
import { MathLayoutEdit, MathLayoutSimpleEdit } from "../../editing/input-tree-edit";
import { InputRowPosition } from "../../input-position/input-row-position";
import { InputTree } from "../../input-tree/input-tree";
import { RowIndices } from "../../input-tree/row-indices";
import { RenderResult } from "../../rendering/render-result";
import { assert, assertUnreachable } from "../../utils/assert";
import { CaretDomElement } from "./single-caret-element";
import { removeAtCaret } from "../../editing/caret-edit";
import { InputNode, InputNodeContainer } from "../../input-tree/input-node";
import { InputRowRange } from "../../input-position/input-row-range";
import { SerializedCaret } from "../../editing/serialized-caret";
import { InputRowZipper } from "../../input-tree/input-zipper";
import { ViewportMath } from "../../rendering/viewport-coordinate";
import { InputGridRange } from "../../input-position/input-grid-range";
import { memoize } from "../../utils/memoize";
import { EditingCaret, EditingCaretSelection } from "../../editing/editing-caret";
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
  // - move carets to the same spot (merge)
  // - select and delete region that contains a caret
*/

export class MathEditorCarets {
  #carets: CaretAndSelection[] = [];

  /**
   * Does not become a real caret until it's finished.
   * Carets inside a selection can be rendered differently.
   * TODO: Move this to a separate class
   */
  #selection: CaretAndSelection | null = null;

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

  moveCarets(direction: "up" | "down" | "left" | "right", renderResult: RenderResult<MathMLElement>) {
    this.finishPointerDown();
    this.map((caret) => {
      caret.moveCaret(this.#syntaxTree, renderResult, direction);
    });
    // TODO: Deduplicate carets/remove overlapping carets
  }

  /**
   * Finishes the current carets, and returns the edit that has been applied.
   */
  removeAtCarets(direction: "left" | "right", tree: InputTree, renderResult: RenderResult<MathMLElement>): MathLayoutEdit {
    // Note: Be very careful about using the syntaxTree here, because it is outdated after the first edit.
    this.finishPointerDown();
    const caretsBefore = this.serialize();
    const edits: MathLayoutSimpleEdit[] = [];

    // Take ownership of the carets
    const carets = this.#carets;
    this.#carets = [];
    for (let i = 0; i < carets.length; i++) {
      const selection = carets[i].selection;
      if (selection.type === "caret") {
        const edit = removeAtCaret(selection.range, direction, renderResult);
        edits.push(...edit.edits);
        edit.edits.forEach((edit) => tree.applyEdit(edit));
        carets[i].setHasEdited();
        carets[i].moveCaretTo(InputRowPosition.deserialize(tree, edit.caret)); // TODO: This function still doesn't work properly

        // Move all other carets according to the edit
        for (let j = 0; j < carets.length; j++) {
          if (i === j) continue;
          edit.edits.forEach((edit) => carets[j].editRanges(tree, edit));
        }
      } else if (selection.type === "grid") {
        // TODO: Implement grid edits
      } else {
        assertUnreachable(selection);
      }
    }

    // TODO: Deduplicate carets/remove overlapping carets

    const caretsAfter: SerializedCaret[] = [];
    for (let i = 0; i < carets.length; i++) {
      caretsAfter.push(carets[i].serialize());
    }
    // TODO: After the syntax tree gets updated, we have to update all the null this.#editingCaret.currentTokens

    return new MathLayoutEdit(edits, caretsBefore, caretsAfter);
  }

  renderCarets(renderResult: RenderResult<MathMLElement>) {
    // TODO: Carets inside the selection can be rendered differently.
    this.map((caret) => caret.renderCaret(renderResult));
  }

  finishCarets() {
    this.map((caret) => caret.finish());
  }

  clearCarets() {
    this.map((caret) => caret.remove());
    this.#carets = [];
  }

  startPointerDown(position: InputRowPosition) {
    this.#selection = CaretAndSelection.fromPosition(this.#containerElement, position, this.#syntaxTree);
  }

  isPointerDown() {
    return this.#selection !== null;
  }

  updatePointerDown(position: InputRowPosition) {
    assert(this.#selection);
    this.#selection.dragEndPosition(position, this.#syntaxTree);
  }

  finishPointerDown() {
    if (this.#selection) {
      // TODO: check where caret ends up. we might need to move an existing caret instead of adding a new one
      // TODO: deduplicate carets after adding it to the list
      this.#carets.push(this.#selection);
      this.#selection = null;
    }
  }

  deserialize(carets: readonly SerializedCaret[], tree: InputTree) {
    this.clearCarets();
    for (let i = 0; i < carets.length; i++) {
      const caret = CaretAndSelection.deserialize(this.#containerElement, carets[i], tree);
      this.#carets.push(caret);
    }
  }

  private serialize() {
    return this.map((v) => v.serialize());
  }

  private map<T>(fn: (caret: CaretAndSelection) => T): T[] {
    return this.#carets.map(fn);
  }
}

class CaretAndSelection {
  /**
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

  #editingCaret: EditingCaret;

  // For rendering
  highlightedElements: ReadonlyArray<Element> = [];
  #element = new CaretDomElement();

  constructor(public container: HTMLElement, editingCaret: EditingCaret) {
    this.#editingCaret = editingCaret;
    container.append(this.#element.element);
  }

  static fromPosition(container: HTMLElement, position: InputRowPosition, syntaxTree: SyntaxNode) {
    return new CaretAndSelection(container, EditingCaret.fromRange(position, position, syntaxTree));
  }

  editRanges(inputTree: InputTree, edit: MathLayoutSimpleEdit) {
    this.#editingCaret = this.#editingCaret.withEditedRanges(inputTree, edit);
  }

  get selection() {
    return this.#editingCaret.selection;
  }

  /**
   * Note: Make sure to re-render the caret after moving it
   * TODO: Support more moving modes, like "move end position only"
   */
  moveCaret(syntaxTree: SyntaxNode, renderResult: RenderResult<MathMLElement>, direction: "up" | "down" | "left" | "right") {
    const newCaret = moveCaret(
      this.selection.type === "caret" ? this.selection.range : this.#endPosition,
      direction,
      renderResult
    );
    if (newCaret) {
      if (this.#currentTokens && newCaret.isContainedIn(this.#currentTokens)) {
        this.#startPosition = newCaret.startPosition();
        this.#endPosition = newCaret.endPosition();
      } else {
        // We basically have to create a new caret
        this.finish();
        this.#startPosition = newCaret.startPosition();
        this.#endPosition = newCaret.endPosition();
        this.#currentTokens = getTokenFromSelection(syntaxTree, this.selection);
        this.#hasEdited = false;
      }
    }
  }

  setHasEdited() {
    this.#editingCaret = new EditingCaret(
      this.#editingCaret.startPosition,
      this.#editingCaret.endPosition,
      this.#editingCaret.currentTokens,
      true
    );
  }

  moveCaretTo(position: InputRowPosition) {
    if (this.#editingCaret.currentTokens && position.isContainedIn(this.#editingCaret.currentTokens)) {
      this.#editingCaret = new EditingCaret(position, position, this.#editingCaret.currentTokens, this.#editingCaret.hasEdited);
    } else {
      this.#editingCaret = new EditingCaret(position, position, null, false);
    }
  }

  /**
   * For mouse dragging.
   */
  dragEndPosition(position: InputRowPosition, syntaxTree: SyntaxNode) {
    this.#editingCaret = EditingCaret.fromRange(this.#editingCaret.startPosition, position, syntaxTree);
  }

  setHighlightedElements(elements: ReadonlyArray<Element>) {
    this.highlightedElements.forEach((v) => v.classList.remove("caret-container-highlight"));
    this.highlightedElements = elements;
    this.highlightedElements.forEach((v) => v.classList.add("caret-container-highlight"));
  }

  renderCaret(renderResult: RenderResult<MathMLElement>) {
    const selected = this.selection;
    if (selected.type === "caret") {
      const range = selected.range;
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
      if (this.#editingCaret.currentTokens) {
        this.#element.setToken(renderResult.getViewportSelection(this.#editingCaret.currentTokens.toRowIndicesAndRange()));
      } else {
        this.#element.setToken(null);
      }
    } else if (selected.type === "grid") {
      const startIndices = RowIndices.fromZipper(selected.range.zipper).addRowIndex([
        selected.range.index,
        selected.range.start,
      ]);
      const renderedStart = renderResult.getViewportSelection({
        indices: startIndices,
        start: 0,
        end: 0,
      });
      const endIndices = RowIndices.fromZipper(selected.range.zipper).addRowIndex([selected.range.index, selected.range.end]);
      const endRowLength = selected.range.getRow(selected.range.end)?.values.length ?? 0;
      const renderedEnd = renderResult.getViewportSelection({
        indices: endIndices,
        start: endRowLength,
        end: endRowLength,
      });
      this.#element.clearSelections();
      this.#element.addSelection(
        ViewportMath.joinRectangles(
          {
            x: Math.min(renderedStart.rect.x, renderedEnd.rect.x),
            y: Math.min(renderedStart.rect.y, renderedEnd.rect.y),
            width: 0,
            height: 0,
          },
          {
            x: Math.max(renderedStart.rect.x + renderedStart.rect.width, renderedEnd.rect.x + renderedEnd.rect.width),
            y: Math.max(renderedStart.rect.y + renderedStart.rect.height, renderedEnd.rect.y + renderedEnd.rect.height),
            width: 0,
            height: 0,
          }
        )
      );

      this.setHighlightedElements([]);
      this.#element.setToken(null);
    } else {
      assertUnreachable(selected);
    }
  }

  finish() {
    if (this.#hasEdited) {
      // TODO:
    }
  }

  remove() {
    this.container.removeChild(this.#element.element);
    this.setHighlightedElements([]);
  }

  serialize(): SerializedCaret {
    return this.#editingCaret.serialize();
  }

  static deserialize(container: HTMLElement, serialized: SerializedCaret, tree: InputTree): CaretAndSelection {
    return new CaretAndSelection(container, EditingCaret.deserialize(serialized, tree));
  }
}
