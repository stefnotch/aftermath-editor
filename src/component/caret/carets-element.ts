import type { SyntaxNode } from "../../core";
import { MathLayoutEdit, type MathLayoutSimpleEdit } from "../../editing/input-tree-edit";
import { InputRowPosition } from "../../input-position/input-row-position";
import type { InputTree } from "../../input-tree/input-tree";
import { RowIndices } from "../../input-tree/row-indices";
import type { RenderResult } from "../../rendering/render-result";
import { assert, assertUnreachable } from "../../utils/assert";
import { CaretDomElement } from "./single-caret-element";
import { insertAtCaret, removeAtCaret } from "../../editing/caret-edit";
import type { SerializedCaret } from "../../editing/serialized-caret";
import { ViewportMath } from "../../rendering/viewport-coordinate";
import { EditingCaret } from "../../editing/editing-caret";
import { moveCaret } from "../../editing/caret-move";
import { InputNodeSymbol } from "../../input-tree/input-node";

/**
 * For now only the default "replace" mode is used.
 *
 * However, adding carets (user holds Alt), or extending the selection (Shift + Arrow Key) should be implemented in the future.
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

  constructor() {
    this.#containerElement = document.createElement("div");
    this.#containerElement.style.position = "absolute";
  }

  get element() {
    return this.#containerElement;
  }

  /*
  private get mainCaret() {
    return this.#carets.at(-1) ?? null;
  }*/

  moveCarets(direction: "up" | "down" | "left" | "right", syntaxTree: SyntaxNode, renderResult: RenderResult<MathMLElement>) {
    this.finishPointerDown();

    const carets = this.#carets;
    this.#carets = [];
    for (let i = 0; i < carets.length; i++) {
      const selection = carets[i].selection;
      if (selection.type === "caret") {
        const moveTo = moveCaret(selection.range, direction, renderResult);
        if (moveTo) {
          if (carets[i].isOutside(moveTo)) {
            carets[i].finishAutocomplete();
          }
          carets[i].moveCaretTo(moveTo);
        }
      } else if (selection.type === "grid") {
        // TODO: Implement grid movement
      } else {
        assertUnreachable(selection);
      }
    }
    // TODO: Deduplicate carets/remove overlapping carets
    this.#carets = carets;

    // Call this to update all missing currentTokens
    this.updateSyntaxTree(syntaxTree);
  }

  /**
   * Finishes the current carets, and returns the edit that has been applied.
   *
   * Remember to call updateMissingCurrentTokens after reparsing.
   */
  removeAtCarets(direction: "left" | "right", tree: InputTree, renderResult: RenderResult<MathMLElement>): MathLayoutEdit {
    // Note: Be very careful about using the syntaxTree here, because it is outdated after the first edit.
    this.finishPointerDown();
    const caretsBefore = this.serialize();
    const edits: MathLayoutSimpleEdit[] = [];

    // Do not finishAutocomplete for any carets

    // Take ownership of the carets
    const carets = this.#carets;
    this.#carets = [];
    for (let i = 0; i < carets.length; i++) {
      const selection = carets[i].selection;
      if (selection.type === "caret") {
        const edit = removeAtCaret(selection.range, direction, renderResult);
        edits.push(...edit.edits);
        edit.edits.forEach((edit) => {
          tree.applyEdit(edit);
          // Update all carets according to the edit
          for (let j = 0; j < carets.length; j++) {
            carets[j].editRanges(tree, edit);
          }
        });
        carets[i].moveCaretTo(InputRowPosition.deserialize(tree, edit.caret));
        carets[i].setHasEdited();
      } else if (selection.type === "grid") {
        // TODO: Implement grid edits
      } else {
        assertUnreachable(selection);
      }
    }

    // TODO: Deduplicate carets/remove overlapping carets

    this.#carets = carets;
    const caretsAfter = carets.map((v) => v.serialize());
    return new MathLayoutEdit(edits, caretsBefore, caretsAfter);
  }

  /**
   * Finishes the current carets, and returns the edit that has been applied.
   *
   * Remember to call updateMissingCurrentTokens after reparsing.
   */
  insertAtCarets(characters: string[], tree: InputTree): MathLayoutEdit {
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
        const edit = insertAtCaret(
          selection.range,
          characters.map((v) => new InputNodeSymbol(v))
        );
        edits.push(...edit.edits);
        edit.edits.forEach((edit) => {
          tree.applyEdit(edit);
          // Update all carets according to the edit
          for (let j = 0; j < carets.length; j++) {
            carets[j].editRanges(tree, edit);
          }
        });
        carets[i].moveCaretTo(InputRowPosition.deserialize(tree, edit.caret));
        carets[i].setHasEdited();

        // TODO: This then checks if any edit can be forcibly completed. If yes, we also do that.
        carets[i].finishAutocomplete();
      } else if (selection.type === "grid") {
        // TODO: Implement grid edits
      } else {
        assertUnreachable(selection);
      }
    }

    // TODO: Deduplicate carets/remove overlapping carets

    this.#carets = carets;
    const caretsAfter = carets.map((v) => v.serialize());
    return new MathLayoutEdit(edits, caretsBefore, caretsAfter);
  }

  /**
   * Needs to be called whenever the syntax tree changes.
   * Kinda an error-prone design.
   */
  updateSyntaxTree(syntaxTree: SyntaxNode) {
    this.#carets.forEach((c) => c.updateMissingCurrentToken(syntaxTree));
  }

  renderCarets(renderResult: RenderResult<MathMLElement>) {
    // TODO: Carets inside the selection can be rendered differently.
    this.map((caret) => caret.renderCaret(renderResult));
    this.#selection?.renderCaret(renderResult);
  }

  finishCarets() {
    /*
finish carets -> if edited, forcibly apply "selected && perfect match" autocompletions (by default the top autocompletion is selected)
*/
    this.map((caret) => caret.finishAutocomplete());
  }

  clearCarets() {
    this.map((caret) => caret.remove());
    this.#carets = [];
  }

  startPointerDown(position: InputRowPosition, syntaxTree: SyntaxNode) {
    this.#selection = CaretAndSelection.fromPosition(this.#containerElement, position, syntaxTree);
  }

  isPointerDown() {
    return this.#selection !== null;
  }

  updatePointerDown(position: InputRowPosition, syntaxTree: SyntaxNode) {
    assert(this.#selection);
    this.#selection.dragEndPosition(position, syntaxTree);
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

  setHasEdited() {
    this.#editingCaret = new EditingCaret(
      this.#editingCaret.startPosition,
      this.#editingCaret.endPosition,
      this.#editingCaret.currentTokens,
      true
    );
  }

  /**
   * Moves the caret to a new position.
   * If it has moved outside of the currently edited token, it's set to null and must be re-obtained.
   */
  moveCaretTo(position: InputRowPosition) {
    if (this.#editingCaret.currentTokens && position.isContainedIn(this.#editingCaret.currentTokens)) {
      this.#editingCaret = new EditingCaret(position, position, this.#editingCaret.currentTokens, this.#editingCaret.hasEdited);
    } else {
      this.#editingCaret = new EditingCaret(position, position, null, this.#editingCaret.hasEdited);
    }
  }

  isOutside(position: InputRowPosition) {
    return !(this.#editingCaret.currentTokens && position.isContainedIn(this.#editingCaret.currentTokens));
  }

  updateMissingCurrentToken(syntaxTree: SyntaxNode) {
    this.#editingCaret = this.#editingCaret.updateMissingCurrentToken(syntaxTree);
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

  finishAutocomplete() {
    if (this.#editingCaret.hasEdited) {
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
