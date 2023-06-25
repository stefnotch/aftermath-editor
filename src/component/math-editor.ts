import "./../core";
import { assert } from "../utils/assert";
import { fromElement as fromMathMLElement, unicodeSplit } from "../mathml/parsing";
import caretStyles from "./caret-styles.css?inline";
import mathEditorStyles from "./math-editor-styles.css?inline";
import inputHandlerStyles from "./input-handler-style.css?inline";
import { InputHandlerElement } from "./input-handler-element";
import { CaretRange } from "./editing/math-layout-caret";
import { InputRowZipper } from "../input-tree/input-zipper";
import { RowIndices } from "../input-tree/row-indices";
import { applyEdit, inverseEdit, MathLayoutEdit } from "../editing/input-tree-edit";
import { UndoRedoManager } from "../editing/undo-redo-manager";
import { InputRowPosition } from "../input-position/input-row-position";
import { MathMLRenderer } from "../mathml/renderer";
import { RenderResult, RenderedElement } from "../rendering/render-result";
import { SyntaxNode, getNodeIdentifiers, joinNodeIdentifier, parse } from "./../core";
import { DebugSettings } from "./debug-settings";
import { MathEditorCarets } from "./caret";
import { InputRow } from "../input-tree/row";
import { InputTree } from "../input-tree/input-tree";

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

  inputTree: InputTree = new InputTree(new InputRow([]));

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
      this.carets.addPointerDownCaret(
        e.pointerId,
        new InputRowPosition(InputRowZipper.fromRowIndices(this.inputTree.rootZipper, newCaret.indices), newCaret.offset)
      );
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
      const PRIMARY_BUTTON = 1;
      if ((e.buttons & PRIMARY_BUTTON) === 0) return;

      const newPositionIndices = this.renderResult.getLayoutPosition({ x: e.clientX, y: e.clientY });
      if (!newPositionIndices) return;
      const newPosition = new InputRowPosition(
        InputRowZipper.fromRowIndices(this.inputTree.rootZipper, newPositionIndices.indices),
        newPositionIndices.offset
      );

      this.carets.updatePointerDownCaret(e.pointerId, newPosition);
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

    // Input handler container
    const inputContainer = document.createElement("span");
    inputContainer.style.position = "absolute";
    this.inputHandler = new InputHandlerElement();
    inputContainer.appendChild(this.inputHandler.element);

    this.inputHandler.element.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowUp") {
        this.carets.moveCarets("up", this.renderResult);
        this.renderCarets();
      } else if (ev.key === "ArrowDown") {
        this.carets.moveCarets("down", this.renderResult);
        this.renderCarets();
      } else if (ev.key === "ArrowLeft") {
        this.carets.moveCarets("left", this.renderResult);
        this.renderCarets();
      } else if (ev.key === "ArrowRight") {
        this.carets.moveCarets("right", this.renderResult);
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
        /*
        

    function applySymbolShortcuts(zipper: InputRowZipper, syntaxNode: SyntaxNode): { rangeEnd: number } {
      // First operate on the children
      if (hasSyntaxNodeChildren(syntaxNode, "Leaf")) {
        // Done
      } else if (hasSyntaxNodeChildren(syntaxNode, "NewRows")) {
        const newRows = syntaxNode.children.NewRows.values;
        assert(syntaxNode.range.start + 1 === syntaxNode.range.end);
        for (let i = 0; i < newRows.length; i++) {
          applySymbolShortcuts(zipper.children[syntaxNode.range.start].children[i], newRows[i]);
        }
      } else if (hasSyntaxNodeChildren(syntaxNode, "Containers")) {
        // TODO: Maybe refactor the syntax node range to only be a width. (We have a ton of constraints on the range anyways.)
        for (const child of syntaxNode.children.Containers) {
          applySymbolShortcuts(zipper, child);
        }
      } else {
        throw new Error("Unknown syntax node children type");
      }

      if (syntaxNode.name[0] === "SymbolShortcut") {
        const type = syntaxNode.name[1];
        const operandValues = syntaxNode.children;
        const deletionEdit = deleteRange(zipper, syntaxNode.range);
        // Do something
      } else {
        return { rangeEnd: syntaxNode.range.end };
      }
    }

    // Handle symbol shortcuts
    const result = applyEdit(this.inputTree, edit);
    const parsed = parse(result.root.value);
    // 1. Get shortcut symbols in syntax tree (nested stuff - indices will change no matter what I do)
    // 2. Get the ranges of the operator symbols and ranges of arguments
    // 3. Delete the ranges
    // 4. Insert the new symbol

    // TODO: If I have those contiguous indices, does the "shift indices after insert/remove" become very easy? Or does it have cursed edge cases?

    */
        if (ev.inputType === "deleteContentBackward" || ev.inputType === "deleteWordBackward") {
          const edit = this.carets.removeAtCarets("left", this.inputTree, this.renderResult);
          this.saveEdit(edit);
          this.applyEdit(edit);
        } else if (ev.inputType === "deleteContentForward" || ev.inputType === "deleteWordForward") {
          const edit = this.carets.removeAtCarets("right", this.inputTree, this.renderResult);
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
            /*const edit = this.finalizeEdits(
              this.carets.map((v) => insertAtCaret(v.caret, new InputRow(characters.map((v) => new InputNodeSymbol(v)))))
            );
            this.saveEdit(edit);
            this.applyEdit(edit);*/
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
      children: { Containers: [] },
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
    this.setInputAndCarets(this.inputTree, []);
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

      const parsedInput = fromMathMLElement(mathMlElement);
      // TODO: Properly report errors
      if (parsedInput.errors.length > 0) {
        console.warn("Parsed input has errors", parsedInput.errors);
      }
      this.setInputAndCarets(parsedInput.inputTree, []);
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
  setInputAndCarets(inputTree: InputTree, newCarets: CaretRange[]) {
    this.inputTree = inputTree;
    this.carets.clearCarets();
    newCarets.forEach((v) => {
      this.carets.add(v);
    });

    const parsed = parse(this.inputTree.root);
    this.syntaxTree = parsed.value;
    console.log("Parsed", parsed);

    this.renderResult = this.renderer.renderAll(parsed);
    console.log("Rendered", this.renderResult);

    // The MathML elements directly under the <math> tag
    const mathMlElements = this.renderResult.getElement(RowIndices.default()).getElements();
    for (const element of mathMlElements) {
      assert(element instanceof MathMLElement);
    }
    this.mathMlElement.replaceChildren(...mathMlElements);

    // Rerender the carets
    this.renderCarets();
  }

  renderCarets() {
    if (!this.isConnected) return;
    this.carets.renderCarets(this.syntaxTree, this.renderResult);

    if (import.meta.env.DEV) {
      if (DebugSettings.renderRows) {
        function debugRenderRows(renderedElement: RenderedElement<MathMLElement>) {
          if (renderedElement.rowIndex) {
            renderedElement.getElements().forEach((v) => v.classList.add("row-debug"));
          }
          renderedElement.getChildren().forEach((child) => debugRenderRows(child));
        }

        debugRenderRows(this.renderResult.getElement(RowIndices.default()));
      }
    }
  }

  saveEdit(edit: MathLayoutEdit) {
    if (edit.edits.length > 0) {
      this.undoRedoStack.push(edit);
    }
  }

  applyEdit(edit: MathLayoutEdit) {
    const result = applyEdit(this.inputTree, edit);
    this.setInputAndCarets(this.inputTree, result.carets);
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
