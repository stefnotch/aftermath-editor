import { type Autocomplete, type SyntaxNode } from "../../core";
import { MathLayoutEdit, type MathLayoutSimpleEdit } from "../../editing/input-tree-edit";
import { InputRowPosition } from "../../input-position/input-row-position";
import type { InputTree } from "../../input-tree/input-tree";
import { RowIndices } from "../../input-tree/row-indices";
import type { RenderResult } from "../../rendering/render-result";
import { assert, assertUnreachable } from "../../utils/assert";
import { CaretDomElement } from "./single-caret-element";
import { insertAtCaret, removeAtCaret, type CaretEdit, removeRange } from "../../editing/caret-edit";
import type { SerializedCaret } from "../../editing/serialized-caret";
import { ViewportMath, type ViewportRect } from "../../rendering/viewport-coordinate";
import { EditingCaret } from "../../editing/editing-caret";
import { moveCaret } from "../../editing/caret-move";
import { InputNodeContainer, InputNodeSymbol } from "../../input-tree/input-node";
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
    this.#autocompleteTokenElement.style.display = "none";
    this.#containerElement.append(tokenHighlighter);
  }

  get element() {
    return this.#containerElement;
  }

  private get mainCaret() {
    return this.#carets.at(0) ?? null;
  }

  get mainCaretBounds(): ViewportRect | null {
    const caret = this.mainCaret;
    if (caret) {
      return caret.getBounds();
    } else {
      return null;
    }
  }

  moveCarets(
    direction: "up" | "down" | "left" | "right",
    inputTree: InputTree,
    renderResult: RenderResult<MathMLElement>
  ): MathLayoutEdit | null {
    this.finishPointerDown(inputTree.getSyntaxTree());
    const caretsBefore = this.serialize();
    const edits: MathLayoutSimpleEdit[] = [];

    const autocompleteEdits = this.usingMatchedAutocomplete(inputTree, (carets) => {
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
    edits.push(...autocompleteEdits.edits);

    if (edits.length === 0) return null;

    const caretsAfter = this.#carets.map((v) => v.serialize());
    return new MathLayoutEdit(edits, caretsBefore, caretsAfter);
  }

  /**
   * Finishes the current carets, and returns the edit that has been applied.
   */
  removeAtCarets(direction: "left" | "right", tree: InputTree, renderResult: RenderResult<MathMLElement>): MathLayoutEdit {
    // Note: Be very careful about using the syntaxTree here, because it is outdated after the first edit.
    this.finishPointerDown(tree.getSyntaxTree());
    const caretsBefore = this.serialize();
    const edits: MathLayoutSimpleEdit[] = [];

    // Do not finishAutocomplete for any carets

    // Take ownership of the carets
    const carets = this.#carets;
    this.#carets = [];
    for (let i = 0; i < carets.length; i++) {
      const selection = carets[i].selection;
      if (selection.type === "caret") {
        const edit = MathEditorCarets.applyEdit(removeAtCaret(selection.range, direction, renderResult), tree, carets);
        edits.push(...edit.edits);
        carets[i].moveCaretTo(edit.caret);
        carets[i].setHasEdited();
      } else if (selection.type === "grid") {
        selection.range.getRowZippers().forEach((row) => {
          const edit = MathEditorCarets.applyEdit(
            removeAtCaret(new InputRowRange(row, 0, row.value.values.length), direction, renderResult),
            tree,
            carets
          );
          edits.push(...edit.edits);
        });
        carets[i].setHasEdited();
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
   */
  insertAtCarets(characters: string[], tree: InputTree): MathLayoutEdit {
    // Note: Be very careful about using the syntaxTree here, because it is outdated after the first edit.
    this.finishPointerDown(tree.getSyntaxTree());
    const caretsBefore = this.serialize();
    const edits: MathLayoutSimpleEdit[] = [];

    let autocompleteEdits = this.usingMatchedAutocomplete(tree, (carets, ranges) => {
      for (let i = 0; i < carets.length; i++) {
        const selection = carets[i].selection;
        if (selection.type === "caret" && !selection.range.isCollapsed && this.isKnownShortcut(characters)) {
          // TODO: Select and shortcut
        } else if (selection.type === "caret") {
          const edit = MathEditorCarets.applyEdit(
            insertAtCaret(
              selection.range,
              characters.map((v) => new InputNodeSymbol(v))
            ),
            tree,
            carets,
            ranges
          );
          edits.push(...edit.edits);
          carets[i].moveCaretTo(edit.caret);
          carets[i].setHasEdited();

          /* if(this.isKnownShortcut(characters)) {
            // Repeatedly reparse the syntax tree

          }*/
        } else if (selection.type === "grid") {
          // TODO: Implement grid edits
        } else {
          assertUnreachable(selection);
        }
      }
      // TODO: Deduplicate carets/remove overlapping carets
      return carets;
    });
    edits.push(...autocompleteEdits.edits);

    const caretsAfter = this.#carets.map((v) => v.serialize());
    return new MathLayoutEdit(edits, caretsBefore, caretsAfter);
  }

  private static applyEdit(
    edit: CaretEdit,
    tree: InputTree,
    carets: CaretAndSelection[],
    ranges: InputRowRange[] = []
  ): { edits: MathLayoutSimpleEdit[]; caret: InputRowPosition } {
    edit.edits.forEach((edit) => {
      tree.applyEdit(edit);
      // Update all carets according to the edit
      for (let j = 0; j < carets.length; j++) {
        carets[j].editRanges(tree, edit);
      }
      for (let j = 0; j < ranges.length; j++) {
        ranges[j] = tree.updateRangeWithEdit(edit, ranges[j]);
      }
    });

    return {
      edits: edit.edits,
      caret: InputRowPosition.deserialize(tree, edit.caret),
    };
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

  /**
   * Whenever an autocomplete result perfectly matches, we apply it.
   * (Our autocomplete results can turn text into symbols.)
   */
  private usingMatchedAutocomplete(
    tree: InputTree,
    callback: (carets: CaretAndSelection[], ranges: InputRowRange[]) => CaretAndSelection[]
  ): { edits: MathLayoutSimpleEdit[] } {
    let autocompleteRange = this.autocompleteRange;
    // ugh, Rust's &mut would be so pretty here
    const ranges = autocompleteRange ? [autocompleteRange] : [];

    // Take ownership of the carets
    const carets = this.#carets;
    this.#carets = [];
    const result = callback(carets, ranges);
    this.#carets = result;

    autocompleteRange = autocompleteRange !== null ? ranges[0] : null;

    const movedOutside = autocompleteRange !== null && this.mainCaret?.isContainedIn(autocompleteRange) === false;
    if (movedOutside && this.mainCaret?.hasEdited) {
      assert(autocompleteRange !== null);
      const startPosition = autocompleteRange.startPosition();
      let perfectMatches = this.#autocompleter.beginningAutocomplete(startPosition, autocompleteRange.end);
      if (perfectMatches === null || perfectMatches.result.potentialRules.length === 0) {
        return { edits: [] };
      }
      if (perfectMatches.result.potentialRules.length > 1) {
        console.warn("Multiple rules matched", perfectMatches);
      }
      // TODO: Deal with multiple carets (https://github.com/stefnotch/aftermath-editor/issues/29#issuecomment-1616656705)
      // Currently we're just dealing with the main caret. Very cheapskate

      console.log("going to apply", perfectMatches);
      const ruleMatch = perfectMatches.result.potentialRules[0];

      // The start position can change during edits
      const ranges = [
        new InputRowRange(startPosition.zipper, startPosition.offset, startPosition.offset + ruleMatch.matchLength),
      ];

      // Delete existing text
      const deleteResult = MathEditorCarets.applyEdit(removeRange(ranges[0]), tree, this.#carets, ranges);

      // Input new text
      let insertResult;
      if (ruleMatch.result.at(0) instanceof InputNodeContainer) {
        // TODO: deal with fractions
        insertResult = MathEditorCarets.applyEdit(
          insertAtCaret(ranges[0].startPosition().range(), ruleMatch.result),
          tree,
          this.#carets
        );
      } else {
        insertResult = MathEditorCarets.applyEdit(
          insertAtCaret(ranges[0].startPosition().range(), ruleMatch.result),
          tree,
          this.#carets
        );
      }
      // Force the main caret to be at the end of the inserted text
      // this.#carets[0].moveCaretTo(insertResult.caret);

      return {
        edits: deleteResult.edits.concat(...insertResult.edits),
      };
      // And the autocomplete range automatically gets recomputed.
    }
    return { edits: [] };
  }

  private updateAutocomplete(syntaxTree: SyntaxNode) {
    const selection = this.mainCaret?.selection ?? null;
    if (selection === null) {
      this.#autocompleteResults = [];
      return;
    }
    if (selection.type === "grid") {
      this.#autocompleteResults = [];
      return;
    }

    const caretPosition = selection.range.endPosition();
    const tokensBeforeCaret = getAutocompleteTokens(syntaxTree, caretPosition).map((v) => v.startPosition());
    this.#autocompleteResults = this.#autocompleter.autocomplete(tokensBeforeCaret, caretPosition.offset);
  }

  get autocompleteResults() {
    return this.#autocompleteResults;
  }

  get selectedAutocompleteResult() {
    return this.#autocompleteResults.at(0)?.result?.potentialRules?.at(0) ?? null;
  }

  /**
   * Range of the currently selected autocomplete
   */
  private get autocompleteRange() {
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
      this.#carets.push(this.#selection);
      this.#selection = null;
      this.updateAutocomplete(syntaxTree);
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

  getBounds() {
    return this.#element.getBounds();
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
      this.#element.setPosition({
        x: renderedCaret.rect.x + (range.isForwards ? renderedCaret.rect.width : 0),
        y: renderedCaret.baseline + caretSize * 0.1,
      });
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
        selected.range.leftOffset,
      ]);
      const renderedStart = renderResult.getViewportRowBounds(startIndices);
      const endIndices = RowIndices.fromZipper(selected.range.zipper).addRowIndex([
        selected.range.index,
        selected.range.rightOffset,
      ]);
      const renderedEnd = renderResult.getViewportRowBounds(endIndices);
      this.#element.clearSelections();
      this.#element.addSelection(
        ViewportMath.joinRectangles(
          {
            x: Math.min(renderedStart.x, renderedEnd.x),
            y: Math.min(renderedStart.y, renderedEnd.y),
            width: 0,
            height: 0,
          },
          {
            x: Math.max(renderedStart.x + renderedStart.width, renderedEnd.x + renderedEnd.width),
            y: Math.max(renderedStart.y + renderedStart.height, renderedEnd.y + renderedEnd.height),
            width: 0,
            height: 0,
          }
        )
      );
      this.#element.setHeight(0);
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
