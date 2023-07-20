import { type Autocomplete, type AutocompleteRuleMatch, type SyntaxNode } from "../../core";
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
import { getAutocompleteTokens, getLineAtPosition, getTokenAtPosition } from "../../editing/editing-autocomplete";
import type { Offset } from "../../input-tree/input-offset";
import type { RenderedSelection } from "../../rendering/rendered-selection";
import { InputRow } from "../../input-tree/row";
import { InputGridRange } from "../../input-position/input-grid-range";

export interface Autocompleter {
  autocomplete(tokenStarts: InputRowPosition[], endPosition: Offset): Autocomplete[];
  beginningAutocomplete(token: InputRowPosition, endPosition: Offset): Autocomplete | null;
}

export type SelectionMode = "character" | "token" | "line";

/**
 * For now only the default "replace" mode is used.
 *
 * However, adding carets (user holds Alt), or extending the selection (Shift + Arrow Key) should be implemented in the future.
 */
export class MathEditorCarets {
  #carets: CaretWithElement[] = [];

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
   */
  #selection: SelectionCaretWithElement | null = null;

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

    const autocompleteEdits = this.usingExitingAutocomplete(inputTree, (carets) => {
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
  removeAtCarets(
    direction: "left" | "right" | "range",
    tree: InputTree,
    renderResult: RenderResult<MathMLElement>
  ): MathLayoutEdit {
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

    let autocompleteEdits = this.usingExitingAutocomplete(tree, (carets, ranges) => {
      for (let i = 0; i < carets.length; i++) {
        const selection = carets[i].selection;
        // Shortcuts are only applied when the selection is a range
        // If the selection is a collapsed caret, then shortcuts work using the autocorrect mechanism.
        // The autocorrect mechanism handles stuff like escaped slashes \/ or \_ and so on.
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

  copyAtCarets(): InputRow[] {
    return this.#carets.map((caret) => {
      if (caret.selection.type === "grid") {
        throw new Error("Not implemented"); // TODO: Implement this
      } else if (caret.selection.type === "caret") {
        const range = caret.selection.range;
        return new InputRow(range.zipper.value.values.slice(range.leftOffset, range.rightOffset));
      } else {
        assertUnreachable(caret.selection);
      }
    });
  }

  pasteAtCarets(inputRows: InputRow[], tree: InputTree): MathLayoutEdit {
    this.finishPointerDown(tree.getSyntaxTree());
    const caretsBefore = this.serialize();
    const edits: MathLayoutSimpleEdit[] = [];

    let mergedInputRows: InputRow | null = null;
    if (this.#carets.length !== inputRows.length) {
      mergedInputRows = new InputRow(inputRows.flatMap((v) => v.values));
    }

    let autocompleteEdits = this.usingExitingAutocomplete(tree, (carets, ranges) => {
      for (let i = 0; i < carets.length; i++) {
        const selection = carets[i].selection;
        if (selection.type === "caret") {
          const edit = MathEditorCarets.applyEdit(
            insertAtCaret(selection.range, mergedInputRows?.values ?? inputRows[i].values),
            tree,
            carets,
            ranges
          );
          edits.push(...edit.edits);
          carets[i].moveCaretTo(edit.caret);
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
    edits.push(...autocompleteEdits.edits);

    const caretsAfter = this.#carets.map((v) => v.serialize());
    return new MathLayoutEdit(edits, caretsBefore, caretsAfter);
  }

  private static applyEdit(
    edit: CaretEdit,
    tree: InputTree,
    carets: CaretWithElement[],
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
    // TODO: Carets inside the selection could be rendered differently.
    this.map((caret) => caret.render(renderResult));
    this.#selection?.render(renderResult);

    // Highlight token at the caret
    const autocompleteRange = this.autocompleteRange;
    if (autocompleteRange !== null) {
      this.renderAutocompleteToken(renderResult.getViewportSelection(autocompleteRange.toRowIndicesAndRange()));
    } else {
      this.renderAutocompleteToken(null);
    }
  }

  /**
   * Whenever an autocomplete result perfectly matches and we're moving somewhere else, we apply it.
   * (Our autocomplete results can turn text into symbols.)
   */
  private usingExitingAutocomplete(
    tree: InputTree,
    callback: (carets: CaretWithElement[], ranges: InputRowRange[]) => CaretWithElement[]
  ): { edits: MathLayoutSimpleEdit[] } {
    let oldAutocompleteRange = this.autocompleteRange;
    // ugh, Rust's &mut would be so pretty here
    const ranges = oldAutocompleteRange ? [oldAutocompleteRange] : [];

    // Take ownership of the carets
    const carets = this.#carets;
    this.#carets = [];
    const result = callback(carets, ranges);
    this.#carets = result;

    oldAutocompleteRange = oldAutocompleteRange !== null ? ranges[0] : null;

    // Treating this shortcut as an autocomplete also allows us to define rules like
    // =/= being a shortcut for ≠
    // without accidentally triggering the / fraction shortcut.

    /*const isShortcut = perfectMatches.result.potentialRules[0].result.at(-1) instanceof InputNodeContainer; // Not ideal, but eh
    if (isShortcut) {
      const ruleMatch = perfectMatches.result.potentialRules[0];
      return this.applyAutocomplete(ruleMatch, startPosition, tree);
    }*/

    if (oldAutocompleteRange === null) {
      return { edits: [] };
    }

    // TODO: Replace the hasEdited with a proper autocomplete popup state.
    // (Autocomplete popup can be displayed or hidden and it can have a line selected or not)
    if (this.mainCaret?.hasEdited !== true) {
      return { edits: [] };
    }

    const startPosition = oldAutocompleteRange.startPosition();
    let perfectMatches = this.#autocompleter.beginningAutocomplete(startPosition, oldAutocompleteRange.end);
    if (perfectMatches === null || perfectMatches.result.potentialRules.length === 0) {
      return { edits: [] };
    }
    if (perfectMatches.result.potentialRules.length > 1) {
      console.warn("Multiple rules matched", perfectMatches);
    }

    const movedOutside = this.mainCaret?.isContainedIn(oldAutocompleteRange) === false;
    console.log(perfectMatches.result);
    if (movedOutside) {
      // TODO: Deal with multiple carets (https://github.com/stefnotch/aftermath-editor/issues/29#issuecomment-1616656705)
      // Currently we're just dealing with the main caret. Very cheapskate
      console.log("going to apply", perfectMatches);
      const ruleMatch = perfectMatches.result.potentialRules[0];
      return this.applyAutocomplete(ruleMatch, startPosition, tree);
      // And the autocomplete range automatically gets recomputed.
    }
    return { edits: [] };
  }

  private applyAutocomplete(ruleMatch: AutocompleteRuleMatch, startPosition: InputRowPosition, tree: InputTree) {
    // The start position can change during edits
    const ranges = [
      new InputRowRange(startPosition.zipper, startPosition.offset, startPosition.offset + ruleMatch.matchLength),
    ];

    // Delete existing text
    const deleteResult = MathEditorCarets.applyEdit(removeRange(ranges[0]), tree, this.#carets, ranges);

    // Input new text
    let insertResult;
    const finalNode = ruleMatch.result.at(-1);
    if (finalNode instanceof InputNodeContainer) {
      const caretEdit = insertAtCaret(ranges[0].startPosition().range(), ruleMatch.result);
      caretEdit.caret.indices = caretEdit.caret.indices.addRowIndex([
        Math.max(0, caretEdit.caret.offset - 1),
        finalNode.rows.values.length - 1,
      ]);
      caretEdit.caret.offset = 0;
      insertResult = MathEditorCarets.applyEdit(caretEdit, tree, this.#carets);
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
   * Range of the currently selected autocomplete.
   * Basically every autocomplete result has its own range of text that it would replace.
   */
  private get autocompleteRange() {
    const selected = this.selectedAutocompleteResult;
    if (selected === null) return null;
    const mainCaretRange = this.mainCaret?.selection.range ?? null;
    if (mainCaretRange === null || mainCaretRange instanceof InputGridRange) return null;

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
    this.#selection = new SelectionCaretWithElement(CaretWithElement.fromPosition(this.#containerElement, position), position);
  }

  /**
   * After a double click, our caret should be in a mode where it always selects complete tokens
   * See also https://github.com/arnog/mathlive/issues/2052
   */
  updatePointerDownOptions(options: { selectionMode: SelectionMode }, syntaxTree: SyntaxNode) {
    this.#selection?.setSelectionMode(options.selectionMode, syntaxTree);
  }

  isPointerDown() {
    return this.#selection !== null;
  }

  updatePointerDown(position: InputRowPosition, syntaxTree: SyntaxNode) {
    this.#selection?.dragEndPosition(position, syntaxTree);
  }

  /**
   * Should be called before the tree is edited.
   */
  finishPointerDown(syntaxTree: SyntaxNode) {
    if (this.#selection) {
      // TODO: check where caret ends up. we might need to move an existing caret instead of adding a new one
      // TODO: deduplicate carets after adding it to the list
      this.#carets.push(this.#selection.intoCaret());
      this.#selection = null;
      this.updateAutocomplete(syntaxTree);
    }
  }

  deserialize(carets: readonly SerializedCaret[], tree: InputTree) {
    this.clearCarets();
    for (let i = 0; i < carets.length; i++) {
      const caret = CaretWithElement.deserialize(this.#containerElement, carets[i], tree);
      this.#carets.push(caret);
    }
  }

  private serialize() {
    return this.map((v) => v.serialize());
  }

  private map<T>(fn: (caret: CaretWithElement) => T): T[] {
    return this.#carets.map(fn);
  }
}

/**
 * Used for pointer-down selections
 */
class SelectionCaretWithElement {
  #caret: CaretWithElement;
  readonly #startPosition: InputRowPosition;
  /**
   * If we're selecting by character, or by token, or by line
   */
  #selectionMode: SelectionMode = "character";
  /**
   * Always included in the selection
   */
  #baseSelection: InputRowRange | null = null;

  constructor(caret: CaretWithElement, startPosition: InputRowPosition) {
    this.#caret = caret;
    this.#startPosition = startPosition;
  }

  render(renderResult: RenderResult<MathMLElement>) {
    this.#caret.render(renderResult);
  }

  intoCaret() {
    return this.#caret;
  }

  setSelectionMode(mode: SelectionMode, syntaxTree: SyntaxNode) {
    this.#selectionMode = mode;
    if (this.#caret.selection.type === "grid") {
      this.#baseSelection = null;
      return;
    }

    if (mode === "character") {
      this.#baseSelection = null;
    } else if (mode === "token") {
      this.#baseSelection = getTokenAtPosition(syntaxTree, this.#caret.selection.range.endPosition());
    } else if (mode === "line") {
      this.#baseSelection = getLineAtPosition(this.#caret.selection.range.endPosition());
    } else {
      assertUnreachable(mode);
    }

    if (this.#baseSelection) {
      this.#caret.moveCaretTo(this.#baseSelection.leftPosition());
      this.#caret.dragEndPosition(this.#baseSelection.rightPosition());
    }
  }

  dragEndPosition(position: InputRowPosition, syntaxTree: SyntaxNode) {
    if (this.#caret.selection.type === "grid") {
      this.#caret.dragEndPosition(position);
      return;
    }

    if (this.#baseSelection && position.isContainedIn(this.#baseSelection)) {
      this.#caret.moveCaretTo(this.#baseSelection.leftPosition());
      this.#caret.dragEndPosition(this.#baseSelection.rightPosition());
      return;
    }

    // Extend the caret selection until here
    let endRange: InputRowRange;
    if (this.#selectionMode === "character") {
      endRange = position.range();
    } else if (this.#selectionMode === "token") {
      endRange = getTokenAtPosition(syntaxTree, position);
    } else if (this.#selectionMode === "line") {
      endRange = getLineAtPosition(position);
    } else {
      assertUnreachable(this.#selectionMode);
    }

    const isForward = this.#startPosition.isBeforeOrEqual(position);

    if (this.#baseSelection) {
      const leftPosition = endRange.leftPosition().isBeforeOrEqual(this.#baseSelection.leftPosition())
        ? endRange.leftPosition()
        : this.#baseSelection.leftPosition();
      const rightPosition = !endRange.rightPosition().isBeforeOrEqual(this.#baseSelection.rightPosition())
        ? endRange.rightPosition()
        : this.#baseSelection.rightPosition();

      this.#caret.moveCaretTo(isForward ? leftPosition : rightPosition);
      this.#caret.dragEndPosition(isForward ? rightPosition : leftPosition);
    } else {
      this.#caret.dragEndPosition(isForward ? endRange.rightPosition() : endRange.leftPosition());
    }
  }
}

class CaretWithElement {
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
    return new CaretWithElement(container, EditingCaret.fromRange(position, position));
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

  render(renderResult: RenderResult<MathMLElement>) {
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

  static deserialize(container: HTMLElement, serialized: SerializedCaret, tree: InputTree): CaretWithElement {
    return new CaretWithElement(container, EditingCaret.deserialize(serialized, tree));
  }
}
