import "./../core";
import { assert } from "../utils/assert";
import { fromElement as fromMathMLElement, unicodeSplit } from "../mathml/parsing";
import caretStyles from "./caret/caret-styles.css?inline";
import mathEditorStyles from "./math-editor-styles.css?inline";
import inputHandlerStyles from "./input/input-handler-style.css?inline";
import autocompleteStyles from "./autocomplete/autocomplete-styles.css?inline";
import { InputHandlerElement } from "./input/input-handler-element";
import { InputRowZipper } from "../input-tree/input-zipper";
import { RowIndices } from "../input-tree/row-indices";
import { MathLayoutEdit } from "../editing/input-tree-edit";
import { UndoRedoManager } from "../editing/undo-redo-manager";
import { InputRowPosition } from "../input-position/input-row-position";
import { MathMLRenderer } from "../mathml/renderer";
import type { RenderResult, RenderedElement } from "../rendering/render-result";
import {
  getNodeIdentifiers,
  joinNodeIdentifier,
  parse,
  autocomplete,
  beginningAutocomplete,
  serializeInput,
  type JsonSerializedInput,
  deserializeInput,
} from "./../core";
import { DebugSettings } from "./debug-settings";
import { MathEditorCarets } from "./caret/carets-element";
import { InputRow } from "../input-tree/row";
import { InputTree } from "../input-tree/input-tree";
import { AutocompleteElement } from "./autocomplete/autocomplete-element";
import { SerializedCaret } from "../editing/serialized-caret";

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
  autocomplete: AutocompleteElement;

  readonly inputTree: InputTree = new InputTree(new InputRow([]), parse);

  renderer: MathMLRenderer;
  renderResult: RenderResult<MathMLElement>;
  renderTaskQueue = new RenderTaskQueue();

  mathMlElement: Element;

  undoRedoStack = new UndoRedoManager<MathLayoutEdit>(MathLayoutEdit.inverseEdit);

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: "open" });

    // Container for math formula
    const container = document.createElement("span");
    container.style.display = "inline-block"; // Needed for the resize observer
    container.style.userSelect = "none";
    container.style.touchAction = "none"; // Dirty hack to disable pinch zoom on mobile, not ideal
    container.tabIndex = 0;

    this.carets = new MathEditorCarets({ autocomplete, beginningAutocomplete });
    container.append(this.carets.element);

    this.addPointerEventListeners(container);

    // Resize - rerender carets in correct locations
    /* Depends on https://github.com/stefnotch/aftermath-editor/issues/58
    Will also need logic to avoid uselessly triggering the resize observer when rerendering the formula.
    const editorResizeObserver = new ResizeObserver(() => {
       this.renderCarets();
    });
    editorResizeObserver.observe(container);
    */

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
    // - better placeholders, don't grab binary operators, but grab multiple symbols and unary operators if possible (like if you have 1+|34 and hit /, the result should be 1+\frac{}{|34})
    // - space to move to the right (but only in some cases)
    // - Shift+arrow keys to select
    // - Shortcuts system (import a lib)

    const inputContainer = document.createElement("span");
    inputContainer.style.position = "absolute";
    this.inputHandler = new InputHandlerElement();
    inputContainer.appendChild(this.inputHandler.element);
    // Click to focus
    container.addEventListener("focus", () => this.inputHandler.focus());
    this.addInputEventListeners();

    this.autocomplete = new AutocompleteElement();
    inputContainer.appendChild(this.autocomplete.element);

    // Rendering
    this.renderer = new MathMLRenderer();
    getNodeIdentifiers().forEach((name) => {
      assert(this.renderer.canRender(name), "Cannot render " + joinNodeIdentifier(name) + ".");
    });

    this.renderResult = this.renderer.renderAll({
      errors: [],
      value: this.inputTree.getSyntaxTree(),
    });

    const styles = document.createElement("style");
    styles.textContent = `${mathEditorStyles}\n ${inputHandlerStyles}\n ${caretStyles}\n ${autocompleteStyles}`;
    shadowRoot.append(styles, inputContainer, container);

    this.updateInput();
  }

  private addInputEventListeners() {
    this.inputHandler.element.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowUp") {
        const edit = this.carets.moveCarets("up", this.inputTree, this.renderResult);
        if (edit) {
          this.saveEdit(edit);
        }
        this.updateInput();
      } else if (ev.key === "ArrowDown") {
        const edit = this.carets.moveCarets("down", this.inputTree, this.renderResult);
        if (edit) {
          this.saveEdit(edit);
        }
        this.updateInput();
      } else if (ev.key === "ArrowLeft") {
        const edit = this.carets.moveCarets("left", this.inputTree, this.renderResult);
        if (edit) {
          this.saveEdit(edit);
        }
        this.updateInput();
      } else if (ev.key === "ArrowRight") {
        const edit = this.carets.moveCarets("right", this.inputTree, this.renderResult);
        if (edit) {
          this.saveEdit(edit);
        }
        this.updateInput();
      } else if (ev.code === "KeyZ" && ev.ctrlKey) {
        const undoAction = this.undoRedoStack.undo();
        if (undoAction !== null) {
          const result = undoAction.applyEdit(this.inputTree);
          this.carets.deserialize(result.carets, this.inputTree);
          this.updateInput();
        }
      } else if (ev.code === "KeyY" && ev.ctrlKey) {
        const redoAction = this.undoRedoStack.redo();
        if (redoAction !== null) {
          const result = redoAction.applyEdit(this.inputTree);
          this.carets.deserialize(result.carets, this.inputTree);
          this.updateInput();
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
 
    */
        if (ev.inputType === "deleteContentBackward" || ev.inputType === "deleteWordBackward") {
          const edit = this.carets.removeAtCarets("left", this.inputTree, this.renderResult);
          this.saveEdit(edit);
          this.updateInput();
        } else if (ev.inputType === "deleteContentForward" || ev.inputType === "deleteWordForward") {
          const edit = this.carets.removeAtCarets("right", this.inputTree, this.renderResult);
          this.saveEdit(edit);
          this.updateInput();
        } else if (ev.inputType === "insertText") {
          // TODO: Table editing
          const data = ev.data;
          if (data === null) return;
          const characters = unicodeSplit(data);
          const edit = this.carets.insertAtCarets(characters, this.inputTree);
          this.saveEdit(edit);
          this.updateInput();
        } else if (ev.inputType === "insertCompositionText") {
          // TODO: Handle it differently
        }
      });
    });

    const handleCopy = () => {
      const copyResult = this.carets.copyAtCarets();
      const json = copyResult.map((v) => serializeInput(v));
      return {
        json: JSON.stringify(json),
      };
    };

    this.inputHandler.element.addEventListener("copy", (ev) => {
      const copyResult = handleCopy();
      ev.clipboardData?.setData("application/json", copyResult.json);
      ev.preventDefault();
    });

    this.inputHandler.element.addEventListener("cut", (ev) => {
      const copyResult = handleCopy();
      ev.clipboardData?.setData("application/json", copyResult.json);
      ev.preventDefault();
      const edit = this.carets.removeAtCarets("range", this.inputTree, this.renderResult);
      this.saveEdit(edit);
      this.updateInput();
    });

    this.inputHandler.element.addEventListener("paste", (ev) => {
      const json = ev.clipboardData?.getData("application/json");
      if (!json) return;

      let input;
      try {
        const parsed: JsonSerializedInput[] = JSON.parse(json);
        input = parsed.map((v) => deserializeInput(v));
      } catch (e) {
        console.error(e);
        return;
      }

      const edit = this.carets.pasteAtCarets(input, this.inputTree);
      this.saveEdit(edit);
      this.updateInput();
    });
  }

  private addPointerEventListeners(container: HTMLSpanElement) {
    const getPointerPosition = (e: MouseEvent): InputRowPosition | null => {
      const newCaret = this.renderResult.getLayoutPosition({ x: e.clientX, y: e.clientY });
      if (!newCaret) return null;
      return new InputRowPosition(InputRowZipper.fromRowIndices(this.inputTree.rootZipper, newCaret.indices), newCaret.offset);
    };

    container.addEventListener("pointerdown", (e) => {
      if (!e.isPrimary) return;
      const newPosition = getPointerPosition(e);
      if (!newPosition) return;

      container.setPointerCapture(e.pointerId);
      // If I'm going to prevent default, then I also have to manually trigger the focus!
      // e.preventDefault();
      // TODO: This is wrong, we shouldn't forcibly finish all carets. Instead, carets that land in a good position should be preserved.
      //this.carets.finishCarets();
      this.carets.clearCarets();
      this.carets.startPointerDown(newPosition);
      this.renderCarets();
    });
    container.addEventListener("pointerup", (e) => {
      if (!e.isPrimary) return;
      const newPosition = getPointerPosition(e);
      if (newPosition) {
        this.carets.updatePointerDown(newPosition, this.inputTree.getSyntaxTree());
      }
      container.releasePointerCapture(e.pointerId);
      this.carets.finishPointerDown(this.inputTree.getSyntaxTree());
      this.renderCarets();
    });
    container.addEventListener("pointercancel", (e) => {
      if (!e.isPrimary) return;

      const newPosition = getPointerPosition(e);
      if (newPosition) {
        this.carets.updatePointerDown(newPosition, this.inputTree.getSyntaxTree());
      }
      container.releasePointerCapture(e.pointerId);
      this.carets.finishPointerDown(this.inputTree.getSyntaxTree());
      this.renderCarets();
    });
    // For double clicking
    // - The dblclick event fires too late for text selection (text selection should happen on pointerdown)
    // - The mouse event fires *after* the pointer event. And it includes the number of clicks info.
    container.addEventListener("mousedown", (e) => {
      if (!this.carets.isPointerDown()) return;
      const clickCount = e.detail;
      if (clickCount === 2) {
        // double click select
        this.carets.updatePointerDownOptions({ selectionMode: "token" }, this.inputTree.getSyntaxTree());
        this.renderCarets();
      } else if (clickCount === 3) {
        // triple click select
        this.carets.updatePointerDownOptions({ selectionMode: "line" }, this.inputTree.getSyntaxTree());
        this.renderCarets();
      }
    });
    container.addEventListener("pointermove", (e) => {
      if (!e.isPrimary) return;
      if (!this.carets.isPointerDown()) return;

      const newPosition = getPointerPosition(e);
      if (!newPosition) return;
      this.carets.updatePointerDown(newPosition, this.inputTree.getSyntaxTree());
      this.renderCarets();
    });
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
      this.inputTree.replaceRoot(parsedInput.root);
      this.setCarets([], this.inputTree);
      this.updateInput();
    } else {
      console.log("Attribute changed", name, oldValue, newValue);
    }
  }

  static get observedAttributes() {
    return ["mathml"];
  }

  setCarets(carets: readonly SerializedCaret[], tree: InputTree) {
    this.carets.deserialize(carets, tree);
  }

  /**
   * Updates the user input. Then reparses and rerenders the math formula.
   */
  updateInput() {
    const parsed = this.inputTree.getParsed();
    this.renderResult = this.renderer.renderAll(this.inputTree.getParsed());
    console.log("Rendered", this.renderResult);

    // The MathML elements directly under the <math> tag
    const mathMlElements = this.renderResult.getElement(RowIndices.default()).getElements();
    for (const element of mathMlElements) {
      assert(element instanceof MathMLElement);
    }
    this.mathMlElement.replaceChildren(...mathMlElements);
    this.carets.updateSyntaxTree(parsed.value);
    this.renderCarets();
    // Workaround for Firefox rendering bug
    for (const element of mathMlElements) {
      assert(element instanceof MathMLElement);
      element.style.transform = "translate(0, 0)";
      element.style.transform = "";
    }
    this.renderCarets();
  }

  renderCarets() {
    if (!this.isConnected) return;
    this.carets.renderCarets(this.renderResult);

    // TODO: Also draw the result of each autocomplete rule
    // TODO: add a "match length" to the autocomplete results (for proper positioning and such)
    /* I want the autocomplete to look like this

    1 + lim|  
      +---------+
      |=lim=====|
      | limSUP  |
      | limINF  |
      +---------+


    explanation: the caret is at the end of "lim", and the autocomplete is showing the results for "lim"
    the first line is selected
    the text is aligned with the caret
    the not yet typed part of the autocomplete is bolded or something
      */
    this.autocomplete.setElements(this.carets.autocompleteResults.flatMap((v) => v.result.potentialRules.map((v) => v.value)));
    const mainCaretBounds = this.carets.mainCaretBounds;
    if (mainCaretBounds) {
      this.autocomplete.setPosition({
        x: mainCaretBounds.x,
        y: mainCaretBounds.y + mainCaretBounds.height,
      });
    }
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
    if (!edit.isEmpty) this.undoRedoStack.push(edit);
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
