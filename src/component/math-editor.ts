import "./../core";
import { assert } from "../utils/assert";
import { fromElement as fromMathMLElement, unicodeSplit } from "../mathml/parsing";
import { mathLayoutWithWidth } from "../math-layout/math-layout-utils";
import caretStyles from "./caret-styles.css?inline";
import mathEditorStyles from "./math-editor-styles.css?inline";
import inputHandlerStyles from "./input-handler-style.css?inline";
import { InputHandlerElement } from "./input-handler-element";
import { MathLayoutCaret } from "./editing/math-layout-caret";
import { MathLayoutRowZipper, fromRowIndices, getRowIndices } from "../math-layout/math-layout-zipper";
import { applyEdit, inverseEdit, MathLayoutEdit } from "../editing/math-layout-edit";
import { UndoRedoManager } from "../editing/undo-redo-manager";
import { CaretEdit, insertAtCaret, removeAtCaret } from "./editing/math-layout-caret-edit";
import { MathLayoutPosition } from "../math-layout/math-layout-position";
import { MathMLRenderer } from "../mathml/renderer";
import { RenderResult, RenderedElement } from "../rendering/render-result";
import { SyntaxNode, getNodeIdentifiers, joinNodeIdentifier, parse } from "./../core";
import { DebugSettings } from "./debug-settings";
import { MathCaret, MathEditorCarets } from "./caret";

function createElementFromHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.firstElementChild;
}

class RenderTaskQueue {
  tasks: (() => void)[] = [];
  constructor() {}

  add(task: () => void) {
    this.tasks.push(task);
    setTimeout(() => {
      this.run();
    }, 0);
  }

  private run() {
    while (this.tasks.length > 0) {
      const task = this.tasks.shift()!;
      task();
    }
  }
}

export class MathEditor extends HTMLElement {
  carets: MathEditorCarets;
  inputHandler: InputHandlerElement;

  inputTree: MathLayoutRowZipper = new MathLayoutRowZipper(
    mathLayoutWithWidth({ type: "row", values: [], width: 0 }),
    null,
    0,
    0
  );

  syntaxTree: SyntaxNode;

  renderer: MathMLRenderer;
  renderResult: RenderResult<MathMLElement>;
  renderTaskQueue = new RenderTaskQueue();

  mathMlElement: Element;

  undoRedoStack = new UndoRedoManager<MathLayoutEdit>(inverseEdit);

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: "open" });

    // Container for math formula
    const container = document.createElement("span");
    container.style.display = "inline-block"; // Needed for the resize observer
    container.style.userSelect = "none";
    container.style.touchAction = "none"; // Dirty hack to disable pinch zoom on mobile, not ideal
    container.tabIndex = 0;

    // Click to focus
    container.addEventListener("focus", () => {
      this.inputHandler.focus();
    });

    this.carets = new MathEditorCarets();
    container.append(this.carets.element);

    container.addEventListener("pointerdown", (e) => {
      const newCaret = this.renderResult.getLayoutPosition({ x: e.clientX, y: e.clientY });
      if (!newCaret) return;

      container.setPointerCapture(e.pointerId);
      // If I'm going to prevent default, then I also have to manually trigger the focus!
      // e.preventDefault();

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

    this.mathMlElement = document.createElement("math");
    container.append(this.mathMlElement);

    // Keyboard input
    // https://d-toybox.com/studio/lib/input_event_viewer.html
    // https://w3c.github.io/uievents/tools/key-event-viewer.html
    // https://tkainrad.dev/posts/why-keyboard-shortcuts-dont-work-on-non-us-keyboard-layouts-and-how-to-fix-it/

    // TODO: Cut-copy-paste go through special code, which also handles all symbols like / ^ _ { } etc.

    // Register keyboard handlers
    // TODO:
    // - special symbols (sum, for, forall, ...) ( https://github.com/arnog/mathlive/search?q=forall )
    // - autocomplete popup
    // - better placeholders, don't grab binary operators, but grab multiple symbols and unary operators if possible (like if you have 1+|34 and hit /, the result should be 1+\frac{}{|34})
    // - space to move to the right (but only in some cases)
    // - Shift+arrow keys to select
    // - Shortcuts system (import a lib)

    // Multi-caret support
    // TODO:
    // - move carets to the same spot (merge)
    // - select and delete region that contains a caret

    // Input handler container
    const inputContainer = document.createElement("span");
    inputContainer.style.position = "absolute";
    this.inputHandler = new InputHandlerElement();
    inputContainer.appendChild(this.inputHandler.element);

    this.inputHandler.element.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowUp") {
        this.carets.map((caret) => caret.moveCaret(this.renderResult, "up"));
        this.renderCarets();
      } else if (ev.key === "ArrowDown") {
        this.carets.map((caret) => caret.moveCaret(this.renderResult, "down"));
        this.renderCarets();
      } else if (ev.key === "ArrowLeft") {
        this.carets.map((caret) => caret.moveCaret(this.renderResult, "left"));
        this.renderCarets();
      } else if (ev.key === "ArrowRight") {
        this.carets.map((caret) => caret.moveCaret(this.renderResult, "right"));
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

    this.inputHandler.element.addEventListener("beforeinput", (ev) => {
      // Woah, apparently running this code later fixes a Firefox textarea bug
      this.renderTaskQueue.add(() => {
        if (ev.inputType === "deleteContentBackward" || ev.inputType === "deleteWordBackward") {
          const edit = this.recordEdits(this.carets.map((v) => removeAtCaret(v.caret, "left", this.renderResult)));
          this.saveEdit(edit);
          this.applyEdit(edit);
        } else if (ev.inputType === "deleteContentForward" || ev.inputType === "deleteWordForward") {
          const edit = this.recordEdits(this.carets.map((v) => removeAtCaret(v.caret, "right", this.renderResult)));
          this.saveEdit(edit);
          this.applyEdit(edit);
        } else if (ev.inputType === "insertText") {
          // TODO: This definitely needs access to the *parsed* stuff, not just the layout
          // (I don't think the removeAtCaret function needs it, but the insertAtCaret function does)

          // TODO: Would some sort of fancy "tree pattern matching" work here?

          // TODO: The hardest short term thing is the multi-character shortcuts, like forall -> ∀
          // Because when we hit backspace, it should change back and stuff like that.
          // So we should at least somehow keep track of what the currently inserted stuff is (and clear that when we click away with the caret or something)
          //
          // TODO: Table editing
          const data = ev.data;
          if (data != null) {
            const characters = unicodeSplit(data);
            const edit = this.recordEdits(
              this.carets.map((v) =>
                insertAtCaret(
                  v.caret,
                  mathLayoutWithWidth({
                    type: "row",
                    values: characters.map((v) => mathLayoutWithWidth({ type: "symbol", value: v, width: 0 })),
                    width: 0,
                  })
                )
              )
            );
            this.saveEdit(edit);
            this.applyEdit(edit);
          }
        } /*else
         if (ev.inputType === "historyUndo") {
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
        }*/
      });
    });

    // Rendering
    this.renderer = new MathMLRenderer();
    getNodeIdentifiers().forEach((name) => {
      assert(this.renderer.canRender(name), "Cannot render " + joinNodeIdentifier(name) + ".");
    });

    this.syntaxTree = {
      name: ["BuiltIn", "Nothing"],
      children: { Leaves: [] },
      value: [],
      range: { start: 0, end: 0 },
    };
    this.renderResult = this.renderer.renderAll({
      errors: [],
      value: this.syntaxTree,
    });

    const styles = document.createElement("style");
    styles.textContent = `${mathEditorStyles}\n ${inputHandlerStyles}\n ${caretStyles}`;
    shadowRoot.append(styles, inputContainer, container);

    // Math formula
    this.setInputTree(this.inputTree, []);
  }

  connectedCallback() {
    // Try to initialize the math element
    this.attributeChangedCallback("mathml", "", this.getAttribute("mathml") ?? "");
  }

  disconnectedCallback() {
    // So far, everything gets cleaned up automatically
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (name === "mathml") {
      const mathMlElement = createElementFromHtml(newValue || "<math></math>");
      assert(mathMlElement instanceof MathMLElement, "Mathml attribute must be a valid mathml element");

      const inputTree = new MathLayoutRowZipper(fromMathMLElement(mathMlElement), null, 0, 0);
      this.setInputTree(inputTree, []);
    } else {
      console.log("Attribute changed", name, oldValue, newValue);
    }
  }

  static get observedAttributes() {
    return ["mathml"];
  }

  /**
   * Updates the user input. Then reparses and rerenders the math formula.
   * Also updates the carets.
   */
  setInputTree(inputTree: MathLayoutRowZipper, newCarets: MathLayoutCaret[]) {
    this.inputTree = inputTree;
    this.carets.clearCarets();
    newCarets.forEach((v) => {
      assert(v.zipper.value === inputTree.value);
      this.carets.add(v);
    });

    const parsed = parse(this.inputTree.value);
    this.syntaxTree = parsed.value;
    console.log("Parsed", parsed);

    this.renderResult = this.renderer.renderAll(parsed);
    console.log("Rendered", this.renderResult);

    // The MathML elements directly under the <math> tag
    const mathMlElements = this.renderResult.getElement([]).getElements();
    for (const element of mathMlElements) {
      assert(element instanceof MathMLElement);
    }
    this.mathMlElement.replaceChildren(...mathMlElements);

    // Rerender the carets
    this.renderCarets();
  }

  renderCarets() {
    if (!this.isConnected) return;
    this.carets.map((v) => this.renderCaret(v));

    if (import.meta.env.DEV) {
      if (DebugSettings.renderRows) {
        function debugRenderRows(renderedElement: RenderedElement<MathMLElement>) {
          if (renderedElement.rowIndex) {
            renderedElement.getElements().forEach((v) => v.classList.add("row-debug"));
          }
          renderedElement.getChildren().forEach((child) => debugRenderRows(child));
        }

        debugRenderRows(this.renderResult.getElement([]));
      }
    }
  }

  renderCaret(caret: MathCaret) {
    const renderedCaret = this.renderResult.getViewportSelection({
      indices: getRowIndices(caret.caret.zipper),
      start: caret.caret.leftOffset,
      end: caret.caret.rightOffset,
    });
    // Render caret itself
    const caretSize = this.renderResult.getViewportCaretSize(getRowIndices(caret.caret.zipper));
    caret.element.setPosition(
      renderedCaret.rect.x + (caret.caret.isForwards ? renderedCaret.rect.width : 0),
      renderedCaret.baseline + caretSize * 0.1
    );
    caret.element.setHeight(caretSize);

    // Render selection
    caret.element.clearSelections();
    if (!caret.caret.isCollapsed) {
      caret.element.addSelection(renderedCaret.rect);
    }

    // Highlight container (for the caret)
    const container = this.renderResult.getElement(getRowIndices(caret.caret.zipper));
    caret.setHighlightedElements(container.getElements());

    // Highlight token at the caret
    const tokenAtCaret = caret.getTokenAtCaret(this.syntaxTree);
    caret.element.setToken(this.renderResult.getViewportSelection(tokenAtCaret));
    // TODO: Use symbols for autocomplete
    const symbolsAtCaret = MathCaret.getSymbolsAt(this.syntaxTree, tokenAtCaret);
  }

  recordEdits(edits: readonly CaretEdit[]): MathLayoutEdit {
    const caretsBefore = this.carets.map((v) => MathLayoutCaret.serialize(v.caret.zipper, v.caret.start, v.caret.end));

    // TODO: Deduplicate carets/remove overlapping carets
    const edit: MathLayoutEdit = {
      type: "multi",
      edits: edits.flatMap((v) => v.edits),
      caretsBefore,
      caretsAfter: edits.map((v) => v.caret),
    };

    // Handle symbol shortcuts
    const result = applyEdit(this.inputTree, edit);
    const parsed = parse(result.root.value);
    // 1. Get shortcut symbols in syntax tree (nested stuff - indices will change no matter what I do)
    // 2. Get the ranges of the operator symbols and ranges of arguments
    // 3. Delete the ranges
    // 4. Insert the new symbol

    // TODO: If I have those contiguous indices, does the "shift indices after insert/remove" become very easy? Or does it have cursed edge cases?

    return edit;
  }

  saveEdit(edit: MathLayoutEdit) {
    if (edit.edits.length > 0) {
      this.undoRedoStack.push(edit);
    }
  }

  applyEdit(edit: MathLayoutEdit) {
    const result = applyEdit(this.inputTree, edit);
    // TODO: Deduplicate carets
    this.setInputTree(result.root, result.carets);
  }

  /**
   * User typed some text
   
  insertAtCaret(caret: MathCaret, text: string) {
    return;     
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
  }*/
}
