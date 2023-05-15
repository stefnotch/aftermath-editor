import { assert } from "../utils/assert";
import { MathLayoutElement, MathLayoutRow } from "../math-layout/math-layout";
import { fromElement as fromMathMLElement } from "../mathml/parsing";
import arrayUtils from "../utils/array-utils";
import { endingBrackets, startingBrackets } from "../mathml/mathml-spec";
import { mathLayoutWithWidth } from "../math-layout/math-layout-utils";
import caretStyles from "./caret-styles.css?inline";
import mathEditorStyles from "./math-editor-styles.css?inline";
import inputHandlerStyles from "./input-handler-style.css?inline";
import { createCaret, CaretElement } from "./caret-element";
import { createInputHandler, MathmlInputHandler } from "./input-handler-element";
import { MathLayoutCaret, moveCaret } from "./editing/math-layout-caret";
import { MathLayoutRowZipper, fromRowIndices, getRowIndices } from "../math-layout/math-layout-zipper";
import { applyEdit, inverseEdit, MathLayoutEdit } from "./editing/math-layout-edit";
import { UndoRedoManager } from "./editing/undo-redo-manager";
import { CaretEdit, removeAtCaret } from "./editing/math-layout-caret-edit";
import { MathLayoutPosition } from "../math-layout/math-layout-position";
import { Offset } from "../math-layout/math-layout-offset";

import "./../core";
import { MathMLRenderer } from "../mathml/renderer";
import { RenderResult } from "../rendering/render-result";
import { getNodeIdentifiers, joinNodeIdentifier, parse } from "./../core";

const debugSettings = {
  debugRenderRows: true,
};

if (import.meta.env.DEV) {
  import("lil-gui").then((GUI) => {
    const gui = new GUI.GUI();
    gui.add(debugSettings, "debugRenderRows");
  });
}

export interface MathCaret {
  /**
   * Where the user started the caret.
   */
  startPosition: MathLayoutPosition;
  /**
   * The current caret, which may be different from the start position if the user has selected a range.
   */
  caret: MathLayoutCaret;
  element: CaretElement;
}

function createElementFromHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.firstElementChild;
}

class MathEditorCarets {
  carets: Set<MathCaret> = new Set<MathCaret>();
  pointerDownCarets: Map<number, MathCaret> = new Map<number, MathCaret>();

  constructor(private containerElement: HTMLElement) {}

  add(layoutCaret: MathLayoutCaret) {
    this.carets.add(this.createCaret(layoutCaret.zipper, layoutCaret.start, layoutCaret.end));
  }

  remove(caret: MathCaret) {
    caret.element.remove();
    this.carets.delete(caret);
  }

  clearCarets() {
    this.carets.forEach((caret) => {
      caret.element.remove();
    });
    this.carets.clear();
  }

  updateCaret(caret: MathCaret, newCaret: MathLayoutCaret | null) {
    if (newCaret) {
      caret.caret = newCaret;
    }
  }

  addPointerDownCaret(pointerId: number, zipper: MathLayoutRowZipper, offset: number) {
    this.pointerDownCarets.set(pointerId, this.createCaret(zipper, offset, offset));
  }

  removePointerDownCaret(pointerId: number) {
    this.pointerDownCarets.delete(pointerId);
  }

  finishPointerDownCaret(pointerId: number) {
    const caret = this.pointerDownCarets.get(pointerId) ?? null;
    if (caret === null) return;
    this.pointerDownCarets.delete(pointerId);
    this.carets.add(caret);
  }

  map<T>(fn: (caret: MathCaret) => T): T[] {
    return Array.from(this.carets).concat(Array.from(this.pointerDownCarets.values())).map(fn);
  }

  private createCaret(zipper: MathLayoutRowZipper, startOffset: Offset, endOffset: Offset) {
    return {
      startPosition: new MathLayoutPosition(zipper, startOffset),
      caret: new MathLayoutCaret(zipper, startOffset, endOffset),
      element: createCaret(this.containerElement),
    };
  }
}

export class MathEditor extends HTMLElement {
  carets: MathEditorCarets;
  inputHandler: MathmlInputHandler;

  inputTree: MathLayoutRowZipper = new MathLayoutRowZipper(
    mathLayoutWithWidth({ type: "row", values: [], width: 0 }),
    null,
    0,
    0
  );

  renderer: MathMLRenderer;
  renderResult: RenderResult<MathMLElement>;

  mathMlElement: Element;

  undoRedoStack = new UndoRedoManager<MathLayoutEdit>(inverseEdit);

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: "open" });

    // Position carets absolutely, relative to the math formula
    const caretContainer = document.createElement("span");
    caretContainer.style.position = "absolute";

    // Container for math formula
    const container = document.createElement("span");
    container.style.display = "inline-block"; // Needed for the resize observer
    container.style.userSelect = "none";
    container.style.touchAction = "none"; // Dirty hack to disable pinch zoom on mobile, not ideal
    container.tabIndex = 0;

    // Click to focus
    container.addEventListener("focus", () => {
      this.inputHandler.inputElement.focus();
    });

    this.carets = new MathEditorCarets(caretContainer);

    container.addEventListener("pointerdown", (e) => {
      const newCaret = this.renderResult.getLayoutPosition({ x: e.clientX, y: e.clientY });
      if (!newCaret) return;

      container.setPointerCapture(e.pointerId);
      e.preventDefault();

      this.carets.clearCarets();
      this.carets.addPointerDownCaret(e.pointerId, fromRowIndices(this.inputTree, newCaret.indices), newCaret.offset);
      this.renderCarets();
    });
    container.addEventListener("pointerup", (e) => {
      container.releasePointerCapture(e.pointerId);
      this.carets.finishPointerDownCaret(e.pointerId);
      this.renderCarets();
    });
    container.addEventListener("pointercancel", (e) => {
      container.releasePointerCapture(e.pointerId);
      this.carets.finishPointerDownCaret(e.pointerId);
      this.renderCarets();
    });
    container.addEventListener("pointermove", (e) => {
      const caret = this.carets.pointerDownCarets.get(e.pointerId);
      if (!caret) return;

      const newPosition = this.renderResult.getLayoutPosition({ x: e.clientX, y: e.clientY });
      if (!newPosition) return;

      // TODO: Table selections
      caret.caret = MathLayoutCaret.getSharedCaret(
        caret.startPosition,
        new MathLayoutPosition(fromRowIndices(this.inputTree, newPosition.indices), newPosition.offset)
      );
      this.renderCarets();
    });

    // Resize - rerender carets in correct locations
    const editorResizeObserver = new ResizeObserver(() => {
      this.renderCarets();
    });
    editorResizeObserver.observe(container, { box: "border-box" });

    // Rendering
    this.renderer = new MathMLRenderer();
    getNodeIdentifiers().forEach((name) => {
      assert(this.renderer.canRender(name), "Cannot render " + joinNodeIdentifier(name) + ".");
    });

    this.renderResult = this.renderer.renderAll({
      errors: [],
      value: {
        name: ["BuiltIn", "Nothing"],
        children: { Leaves: [] },
        value: [],
        range: { start: 0n, end: 0n },
      },
    });
    this.mathMlElement = document.createElement("math");
    container.append(this.mathMlElement);
    this.setMathMl(this.renderResult.getElement([]).getElements());

    // Keyboard input
    // https://d-toybox.com/studio/lib/input_event_viewer.html
    // https://w3c.github.io/uievents/tools/key-event-viewer.html
    // https://tkainrad.dev/posts/why-keyboard-shortcuts-dont-work-on-non-us-keyboard-layouts-and-how-to-fix-it/

    // Register keyboard handlers
    // TODO:
    // - special symbols (sum, for, forall, ...) ( https://github.com/arnog/mathlive/search?q=forall )
    // - autocomplete popup
    // - brackets and non-brackets
    // - better placeholders, don't grab binary operators, but grab multiple symbols and unary operators if possible (like if you have 1+|34 and hit /, the result should be 1+\frac{}{|34})
    // - space to move to the right (but only in some cases)
    // - Letters and numbers
    // - quotes to type "strings"?
    // - Shift+arrow keys to select
    // - Shortcuts system (import a lib)
    // - undo and redo

    // Register mouse handlers
    // - Click (put cursor)
    // - Drag (selection)

    // Multi-caret support
    // TODO:
    // - move carets to the same spot (merge)
    // - select and delete region that contains a caret

    // Input handler container
    const inputContainer = document.createElement("span");
    inputContainer.style.position = "absolute";
    this.inputHandler = createInputHandler(inputContainer);

    this.inputHandler.inputElement.addEventListener("keydown", (ev) => {
      console.info("keydown", ev);
      if (ev.key === "ArrowUp") {
        this.carets.map((caret) => this.moveCaret(caret, "up"));
        this.renderCarets();
      } else if (ev.key === "ArrowDown") {
        this.carets.map((caret) => this.moveCaret(caret, "down"));
        this.renderCarets();
      } else if (ev.key === "ArrowLeft") {
        this.carets.map((caret) => this.moveCaret(caret, "left"));
        this.renderCarets();
      } else if (ev.key === "ArrowRight") {
        this.carets.map((caret) => this.moveCaret(caret, "right"));
        this.renderCarets();
      } else if (ev.code === "KeyZ" && ev.ctrlKey) {
        const undoAction = this.undoRedoStack.undo();
        if (undoAction !== null) {
          this.applyEdit(undoAction);
        }
      } else if (ev.code === "KeyY" && ev.ctrlKey) {
        const redoAction = this.undoRedoStack.redo();
        if (redoAction !== null) {
          this.applyEdit(redoAction);
        }
      }
    });

    this.inputHandler.inputElement.addEventListener("beforeinput", (ev) => {
      console.info("beforeinput", ev);

      if (ev.inputType === "deleteContentBackward" || ev.inputType === "deleteWordBackward") {
        const edit = this.recordEdit(this.carets.map((v) => removeAtCaret(v.caret, "left", this.renderResult)));
        this.saveEdit(edit);
        this.applyEdit(edit);
      } else if (ev.inputType === "deleteContentForward" || ev.inputType === "deleteWordForward") {
        const edit = this.recordEdit(this.carets.map((v) => removeAtCaret(v.caret, "right", this.renderResult)));
        this.saveEdit(edit);
        this.applyEdit(edit);
      } else if (ev.inputType === "insertText") {
        const data = ev.data;
        // TODO:
        if (data != null) {
          this.carets.map((caret) => this.insertAtCaret(caret, data));
        }
      } else if (ev.inputType === "historyUndo") {
        // TODO: https://stackoverflow.com/questions/27027833/is-it-possible-to-edit-a-text-input-with-javascript-and-add-to-the-undo-stack
        // ^ Fix it using this slightly dirty hack
        // Doesn't reliably fire, ugh
        // I might be able to hack around this by firing keyboard events such that the browser has something to undo
        // Or I could just wait for the Keyboard API to get implemented
        ev.preventDefault();
      } else if (ev.inputType === "historyRedo") {
        // Doesn't reliably fire, ugh
        // I might be able to hack around this by firing keyboard events such that the browser has something to redo
        // Or I could just wait for the Keyboard API to get implemented
        ev.preventDefault();
      }
    });

    const styles = document.createElement("style");
    styles.textContent = `${mathEditorStyles}\n ${inputHandlerStyles}\n ${caretStyles}`;
    shadowRoot.append(styles, caretContainer, inputContainer, container);

    // Math formula
    this.setInputTree(this.inputTree);
    this.renderCarets();
  }

  connectedCallback() {
    // Try to initialize the math element
    this.attributeChangedCallback("mathml", "", this.getAttribute("mathml") ?? "");
    this.renderCarets();
  }

  disconnectedCallback() {
    // So far, everything gets cleaned up automatically
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (name === "mathml") {
      const mathMlElement = createElementFromHtml(newValue || "<math></math>");
      assert(mathMlElement instanceof MathMLElement, "Mathml attribute must be a valid mathml element");

      this.carets.clearCarets();
      this.setInputTree(new MathLayoutRowZipper(fromMathMLElement(mathMlElement), null, 0, 0));
      this.carets.add(new MathLayoutCaret(this.inputTree, 0, 0));

      console.log(this.inputTree);
    } else {
      console.log("Attribute changed", name, oldValue, newValue);
    }
  }

  static get observedAttributes() {
    return ["mathml"];
  }

  /**
   * Updates the user input. Then reparses and rerenders the math formula.
   * Note: Does not rerender the carets.
   */
  setInputTree(inputTree: MathLayoutRowZipper) {
    this.inputTree = inputTree;

    const parsed = parse(this.inputTree.value);
    console.log("Parsed", parsed);
    this.renderResult = this.renderer.renderAll(parsed);
    console.log("Rendered", this.renderResult);

    // The MathML elements directly under the <math> tag
    const topLevelElements = this.renderResult.getElement([]).getElements();
    this.setMathMl(topLevelElements);
  }

  renderCarets() {
    if (!this.isConnected) return;
    this.carets.map((v) => this.renderCaret(v));

    if (import.meta.env.DEV) {
      if (debugSettings.debugRenderRows) {
        function debugRenderRow(domTranslator: typeof lastLayout.domTranslator) {
          domTranslator.element.classList.add("row-debug");

          domTranslator.children.forEach((child) => {
            if (child.value.type === "symbol") {
              // Do nothing
            } else if (
              child.value.type === "fraction" ||
              child.value.type === "root" ||
              child.value.type === "under" ||
              child.value.type === "over" ||
              child.value.type === "sup" ||
              child.value.type === "sub" ||
              child.value.type === "table"
            ) {
              child.children.forEach((row) => debugRenderRow(row));
            }
          });
        }

        // TODO: debugRenderRow(lastLayout.domTranslator);
      }
    }
  }

  renderCaret(caret: MathCaret) {
    const layout = this.renderResult.getViewportPosition({
      indices: getRowIndices(caret.caret.zipper),
      offset: caret.caret.end,
    });
    caret.element.setPosition(layout.position.x, layout.position.y);
    caret.element.setHeight(layout.height);

    const container = this.renderResult.getElement(getRowIndices(caret.caret.zipper));
    caret.element.setHighlightContainer(container.getElements());

    caret.element.clearSelections();
    if (!caret.caret.isCollapsed) {
      const rangeLayoutLeft = this.renderResult.getViewportPosition({
        indices: getRowIndices(caret.caret.zipper),
        offset: caret.caret.leftOffset,
      });
      const rangeLayoutRight = this.renderResult.getViewportPosition({
        indices: getRowIndices(caret.caret.zipper),
        offset: caret.caret.rightOffset,
      });

      const width = rangeLayoutRight.position.x - rangeLayoutLeft.position.x;
      const height = rangeLayoutLeft.height;
      caret.element.addSelection(rangeLayoutLeft.position.x, rangeLayoutLeft.position.y, width, height);
    }
  }

  recordEdit(edits: readonly CaretEdit[]): MathLayoutEdit {
    const caretsBefore = this.carets.map((v) => MathLayoutCaret.serialize(v.caret.zipper, v.caret.start, v.caret.end));

    return {
      type: "multi",
      edits: edits.flatMap((v) => v.edits),
      caretsBefore,
      caretsAfter: edits.map((v) => v.caret),
    };
  }

  saveEdit(edit: MathLayoutEdit) {
    if (edit.edits.length > 0) {
      this.undoRedoStack.push(edit);
    }
  }

  applyEdit(edit: MathLayoutEdit) {
    this.carets.clearCarets();

    const result = applyEdit(this.inputTree, edit);
    this.setInputTree(result.root);

    // TODO: Deduplicate carets
    result.carets.forEach((v) => this.carets.add(v));
    this.renderCarets();
  }

  /**
   * Note: Make sure to re-render the caret after moving it
   */
  moveCaret(caret: MathCaret, direction: "up" | "down" | "left" | "right") {
    const newCaret = moveCaret(caret.caret, direction, this.renderResult);
    if (newCaret) {
      caret.caret = newCaret;
    }
  }

  /**
   * User typed some text
   */
  insertAtCaret(caret: MathCaret, text: string) {
    return;
    /**
     * Used for "placeholders"
     */
    function takeElementOrBracket(mathAst: MathAst, caret: MathCaret, direction: "left" | "right"): MathLayoutRow | null {
      if (caret.row.type == "row") {
        const elementIndex = caret.offset + (direction == "left" ? -1 : 0);
        const element = arrayUtils.get(caret.row.values, elementIndex) ?? null;

        if (element == null) return null;
        if (element.type == "bracket") {
          if (
            (direction == "left" && startingBrackets.has(element.value)) ||
            (direction == "right" && endingBrackets.has(element.value))
          ) {
            return null;
          }

          const otherBracketIndex = findOtherBracket(caret.row.values, elementIndex, direction);
          if (otherBracketIndex) {
            const start = Math.min(elementIndex, otherBracketIndex);
            const end = Math.max(elementIndex, otherBracketIndex);
            const newRow: MathLayoutRow = {
              type: "row",
              values: [],
            };
            const bracketedElements = caret.row.values.slice(start, end + 1);
            for (let i = 0; i < bracketedElements.length; i++) {
              mathAst.removeChild(caret.row, bracketedElements[i]);
              mathAst.insertChild(newRow, bracketedElements[i], i);
            }
            if (direction == "left") {
              caret.offset -= bracketedElements.length;
            }
            return newRow;
          }
        } else {
          mathAst.removeChild(caret.row, element);
          // So that the caret's location never becomes invalid
          if (direction == "left") {
            caret.offset -= 1;
          }
          return { type: "row", values: [element] };
        }
      }
      return null;
    }

    const mathAst = this.mathAst;
    function insertMathLayout<T extends MathLayoutElement>(mathIR: T): T {
      assert(caret.row.type == "row");
      mathAst.setParents(null, [mathIR]);
      mathAst.insertChild(caret.row, mathIR, caret.offset);

      return mathIR;
    }

    if (caret.row.type == "row") {
      if (text == "^") {
        const mathIR = insertMathLayout({
          type: "sup",
          values: [takeElementOrBracket(this.mathAst, caret, "right") ?? { type: "row", values: [] }],
        });
        caret.row = mathIR.values[0];
        caret.offset = 0;
      } else if (text == "_") {
        const mathIR = insertMathLayout({
          type: "sub",
          values: [takeElementOrBracket(this.mathAst, caret, "right") ?? { type: "row", values: [] }],
        });
        caret.row = mathIR.values[0];
        caret.offset = 0;
      } else if (text == "/") {
        const mathIR = insertMathLayout({
          type: "fraction",
          values: [
            takeElementOrBracket(this.mathAst, caret, "left") ?? { type: "row", values: [] },
            takeElementOrBracket(this.mathAst, caret, "right") ?? { type: "row", values: [] },
          ],
        });
        caret.row = mathIR.values[1];
        caret.offset = 0;
      } else if (text.length == 1) {
        // Broken unicode support ^
        this.mathAst.insertChild(
          caret.row,
          {
            type: "symbol",
            value: text,
          },
          caret.offset
        );
        caret.offset += 1;
      } else {
        // Attempted to insert multiple things
      }
    } else {
      caret.row.value = caret.row.value.slice(0, caret.offset) + text + caret.row.value.slice(caret.offset);
      caret.offset += text.length;
    }
  }

  setMathMl(elements: ReadonlyArray<MathMLElement>) {
    for (const element of elements) {
      assert(element instanceof MathMLElement);
    }

    // Notice how this doesn't copy the attributes
    this.mathMlElement.replaceChildren(...elements);
  }
}
