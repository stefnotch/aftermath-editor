import { type Autocomplete, type SyntaxNode } from "../../core";
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
import { InputRowRange } from "../../input-position/input-row-range";
import { getAutocompleteTokens } from "../../editing/editing-autocomplete";
import type { Offset } from "../../input-tree/input-offset";
import type { RenderedSelection } from "../../rendering/rendered-selection";

export interface Autocompleter {
  autocomplete(tokenStarts: InputRowPosition[], endPosition: Offset): Autocomplete[];
  beginningAutocomplete(token: InputRowPosition, endPosition: Offset): Autocomplete | null;
}

/**
 * For now only the default "replace" mode is used.
 *
 * However, adding carets (user holds Alt), or extending the selection (Shift + Arrow Key) should be implemented in the future.
 */
export class MathEditorCarets {
  #carets: CaretAndSelection[] = [];

  // TODO: Move those to a separate class
  #autocompleter: Autocompleter;
  /**
   * Autocomplete results for the main caret.
   * TODO: Should be sorted.
   */
  #autocompleteResults: Autocomplete[] = [];

  #autocompleteTokenElement: HTMLElement;

  /**
   * Does not become a real caret until it's finished.
   * Carets inside a selection can be rendered differently.
   * TODO: Move this to a separate class
   */
  #selection: CaretAndSelection | null = null;

  #containerElement: HTMLElement;

  constructor(autocompleter: Autocompleter) {
    this.#containerElement = document.createElement("div");
    this.#containerElement.style.position = "absolute";
    this.#autocompleter = autocompleter;

    const tokenHighlighter = document.createElement("div");
    tokenHighlighter.className = "caret-token-highlighter";
    this.#autocompleteTokenElement = tokenHighlighter;
    this.#containerElement.append(tokenHighlighter);
  }

  get element() {
    return this.#containerElement;
  }

  private get mainCaret() {
    return this.#carets.at(0) ?? null;
  }

  moveCarets(direction: "up" | "down" | "left" | "right", syntaxTree: SyntaxNode, renderResult: RenderResult<MathMLElement>) {
    this.finishPointerDown(syntaxTree);

    this.withAutocomplete((carets) => {
      for (let i = 0; i < carets.length; i++) {
        const selection = carets[i].selection;
        if (selection.type === "caret") {
          const moveTo = moveCaret(selection.range, direction, renderResult);
          if (moveTo) {
            carets[i].moveCaretTo(moveTo);
          }
        } else if (selection.type === "grid") {
          // TODO: Implement grid movement
        } else {
          assertUnreachable(selection);
        }
      }
      // TODO: Deduplicate carets/remove overlapping carets
      return carets;
    });

    // Call this to update all missing currentTokens
    this.updateSyntaxTree(syntaxTree);
  }

  /**
   * Finishes the current carets, and returns the edit that has been applied.
   *
   * Remember to call updateMissingCurrentTokens after reparsing.
   */
  removeAtCarets(
    direction: "left" | "right",
    tree: InputTree,
    syntaxTree: SyntaxNode,
    renderResult: RenderResult<MathMLElement>
  ): MathLayoutEdit {
    // Note: Be very careful about using the syntaxTree here, because it is outdated after the first edit.
    this.finishPointerDown(syntaxTree);
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
  insertAtCarets(characters: string[], tree: InputTree, syntaxTree: SyntaxNode): MathLayoutEdit {
    // Note: Be very careful about using the syntaxTree here, because it is outdated after the first edit.
    this.finishPointerDown(syntaxTree);
    const caretsBefore = this.serialize();
    const edits: MathLayoutSimpleEdit[] = [];

    // Take ownership of the carets
    this.withAutocomplete((carets) => {
      for (let i = 0; i < carets.length; i++) {
        const selection = carets[i].selection;
        if (selection.type === "caret" && !selection.range.isCollapsed && this.isKnownShortcut(characters)) {
          // TODO: Select and shortcut
        } else if (selection.type === "caret") {
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
        } else if (selection.type === "grid") {
          // TODO: Implement grid edits
        } else {
          assertUnreachable(selection);
        }
      }
      // TODO: Deduplicate carets/remove overlapping carets
      return carets;
    });

    const caretsAfter = this.#carets.map((v) => v.serialize());
    return new MathLayoutEdit(edits, caretsBefore, caretsAfter);
  }

  isKnownShortcut(_characters: string[]) {
    return false;
    /*        TODO: Don't hardcode here
        if (characters.length === 1) {
          if (characters[0] === "/") {
          } else if (characters[0] === "^") {
          } else if (characters[0] === "_") {
          } else if (characters[0] === "(") {
          }
        }*/
  }

  /**
   * Needs to be called whenever the syntax tree changes.
   * Kinda an error-prone design.
   */
  updateSyntaxTree(syntaxTree: SyntaxNode) {
    this.updateAutocomplete(syntaxTree);
  }

  renderCarets(renderResult: RenderResult<MathMLElement>) {
    // TODO: Carets inside the selection can be rendered differently.
    this.map((caret) => caret.renderCaret(renderResult));
    this.#selection?.renderCaret(renderResult);

    // Highlight token at the caret
    const autocompleteRange = this.autocompleteRange;
    if (autocompleteRange !== null) {
      this.renderAutocompleteToken(renderResult.getViewportSelection(autocompleteRange.toRowIndicesAndRange()));
    } else {
      this.renderAutocompleteToken(null);
    }
  }

  private withAutocomplete(callback: (carets: CaretAndSelection[]) => CaretAndSelection[]) {
    const autocompleteRange = this.autocompleteRange;
    const carets = this.#carets;
    this.#carets = [];

    const result = callback(carets);
    this.#carets = result;

    const movedOutside = autocompleteRange !== null && this.mainCaret?.isContainedIn(autocompleteRange) === false;
    if (movedOutside && this.mainCaret?.hasEdited) {
      let perfectMatches = this.#autocompleter.beginningAutocomplete(autocompleteRange.startPosition(), autocompleteRange.end);
      console.log("going to apply", perfectMatches);
      /*
finish carets -> if edited, forcibly apply "selected && perfect match" autocompletions (by default the top autocompletion is selected)
*/
      // TODO: apply this
      // and deal with fractions

      // We don't have to shrink the autocomplete range, since it gets recomputed every time anyways.
    }
  }

  private updateAutocomplete(syntaxTree: SyntaxNode) {
    const caretPosition = this.mainCaret?.selection?.range?.endPosition() ?? null;
    if (caretPosition !== null) {
      const tokensBeforeCaret = getAutocompleteTokens(syntaxTree, caretPosition).map((v) => v.startPosition());
      this.#autocompleteResults = this.#autocompleter.autocomplete(tokensBeforeCaret, caretPosition.offset);
    } else {
      this.#autocompleteResults = [];
    }
  }

  get autocompleteResults() {
    return this.#autocompleteResults;
  }

  get selectedAutocompleteResult() {
    return this.#autocompleteResults.at(0)?.result?.potentialRules?.at(0) ?? null;
  }

  get autocompleteRange() {
    const selected = this.selectedAutocompleteResult;
    if (selected === null) return null;
    const mainCaretRange = this.mainCaret?.selection.range ?? null;
    if (mainCaretRange === null) return null;

    return new InputRowRange(mainCaretRange.zipper, mainCaretRange.end - selected.matchLength, mainCaretRange.end);
  }

  renderAutocompleteToken(selection: RenderedSelection | null) {
    if (selection === null) {
      this.#autocompleteTokenElement.style.display = "none";
    } else if (selection.isCollapsed) {
      this.#autocompleteTokenElement.style.display = "none";
    } else {
      this.#autocompleteTokenElement.style.display = "block";
      const parentPos = this.#containerElement.getBoundingClientRect();
      this.#autocompleteTokenElement.style.left = `${selection.rect.x - parentPos.left}px`;
      this.#autocompleteTokenElement.style.top = `${selection.rect.y - parentPos.top}px`;
      this.#autocompleteTokenElement.style.width = `${selection.rect.width}px`;
      this.#autocompleteTokenElement.style.height = `${selection.rect.height}px`;
    }
  }

  clearCarets() {
    this.map((caret) => caret.remove());
    this.#carets = [];
  }

  startPointerDown(position: InputRowPosition) {
    this.#selection = CaretAndSelection.fromPosition(this.#containerElement, position);
  }

  isPointerDown() {
    return this.#selection !== null;
  }

  updatePointerDown(position: InputRowPosition) {
    assert(this.#selection);
    this.#selection.dragEndPosition(position);
  }

  finishPointerDown(syntaxTree: SyntaxNode) {
    if (this.#selection) {
      // TODO: check where caret ends up. we might need to move an existing caret instead of adding a new one
      // TODO: deduplicate carets after adding it to the list
      this.updateAutocomplete(syntaxTree);
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

  private constructor(public container: HTMLElement, editingCaret: EditingCaret) {
    this.#editingCaret = editingCaret;
    container.append(this.#element.element);
  }

  static fromPosition(container: HTMLElement, position: InputRowPosition) {
    return new CaretAndSelection(container, EditingCaret.fromRange(position, position));
  }

  editRanges(inputTree: InputTree, edit: MathLayoutSimpleEdit) {
    this.#editingCaret = this.#editingCaret.withEditedRanges(inputTree, edit);
  }

  get selection() {
    return this.#editingCaret.selection;
  }

  isContainedIn(range: InputRowRange) {
    return (
      this.#editingCaret.selection.type === "caret" && this.#editingCaret.selection.range.endPosition().isContainedIn(range)
    );
  }

  setHasEdited() {
    this.#editingCaret = new EditingCaret(this.#editingCaret.startPosition, this.#editingCaret.endPosition, true);
  }

  /**
   * Moves the caret to a new position.
   */
  moveCaretTo(position: InputRowPosition) {
    this.#editingCaret = new EditingCaret(position, position, this.#editingCaret.hasEdited);
  }

  /**
   * For mouse dragging.
   */
  dragEndPosition(position: InputRowPosition) {
    this.#editingCaret = EditingCaret.fromRange(this.#editingCaret.startPosition, position);
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
    } else {
      assertUnreachable(selected);
    }
  }

  get hasEdited() {
    return this.#editingCaret.hasEdited;
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
