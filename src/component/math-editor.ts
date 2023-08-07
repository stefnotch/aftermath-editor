import "./../core";
import { assert, assertUnreachable } from "../utils/assert";
import { fromElement as fromMathMLElement, unicodeSplit } from "../mathml/parsing";
import caretStyles from "./caret/caret-styles.css?inline";
import mathEditorStyles from "./math-editor-styles.css?inline";
import inputHandlerStyles from "./input/input-handler-style.css?inline";
import autocompleteStyles from "./autocomplete/autocomplete-styles.css?inline";
import { InputHandlerElement } from "./input/input-handler-element";
import { RowIndices } from "../input-tree/row-indices";
import { MathMLRenderer } from "../mathml/renderer";
import type { RenderResult, RenderedElement } from "../rendering/render-result";
import {
  joinNodeIdentifier,
  MathEditorBindings,
  MathEditorHelper,
  type MinimalInputRowPosition,
  type SyntaxNode,
} from "./../core";
import { DebugSettings } from "./debug-settings";
import { AutocompleteElement } from "./autocomplete/autocomplete-element";
import { CaretDomElement } from "./caret/single-caret-element";
import { createNode, htmlToElement } from "../utils/dom-utils";
import { keyIn } from "../utils/pattern-matching-utils";
import { ViewportMath } from "../rendering/viewport-coordinate";

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
  mathEditor: MathEditorBindings;
  inputHandler: InputHandlerElement;
  autocomplete: AutocompleteElement;
  caretsContainer: Element;

  syntaxTree: SyntaxNode;
  renderer: MathMLRenderer;
  renderResult: RenderResult<MathMLElement>;
  renderTaskQueue = new RenderTaskQueue();

  mathMlElement: Element;

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: "open" });

    // Container for math formula
    const container = createNode("span", {
      style: {
        display: "inline-block", // Needed for the resize observer
        userSelect: "none",
        touchAction: "none", // Dirty hack to disable pinch zoom on mobile, not ideal
      },
      tabIndex: 0,
    });
    this.mathEditor = new MathEditorBindings();

    this.caretsContainer = createNode("div", {
      style: {
        position: "absolute",
      },
    });
    container.append(this.caretsContainer);
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

    const inputContainer = createNode("span", {
      style: {
        position: "absolute",
      },
    });
    this.inputHandler = new InputHandlerElement();
    inputContainer.appendChild(this.inputHandler.element);
    // Click to focus
    container.addEventListener("focus", () => this.inputHandler.focus());
    this.addInputEventListeners();

    this.autocomplete = new AutocompleteElement();
    inputContainer.appendChild(this.autocomplete.element);

    // Rendering
    this.renderer = new MathMLRenderer();
    MathEditorHelper.getTokenNames(this.mathEditor).forEach((name) => {
      assert(this.renderer.canRender(name), "Cannot render " + joinNodeIdentifier(name) + ".");
    });

    this.syntaxTree = MathEditorHelper.getSyntaxTree(this.mathEditor);
    this.renderResult = this.renderer.renderAll({
      errors: [],
      value: this.syntaxTree,
    });

    const styles = document.createElement("style");
    styles.textContent = `${mathEditorStyles}\n ${inputHandlerStyles}\n ${caretStyles}\n ${autocompleteStyles}`;
    shadowRoot.append(styles, inputContainer, container);

    this.updateInput();
  }

  private addInputEventListeners() {
    this.inputHandler.element.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowUp") {
        this.mathEditor.move_caret("Up", "Char");
      } else if (ev.key === "ArrowDown") {
        this.mathEditor.move_caret("Down", "Char");
      } else if (ev.key === "ArrowLeft") {
        this.mathEditor.move_caret("Left", "Char");
      } else if (ev.key === "ArrowRight") {
        this.mathEditor.move_caret("Right", "Char");
      } else if (ev.code === "KeyZ" && ev.ctrlKey) {
        this.mathEditor.undo();
      } else if (ev.code === "KeyY" && ev.ctrlKey) {
        this.mathEditor.redo();
      }
      this.updateInput();
    });

    this.inputHandler.element.addEventListener("beforeinput", (ev) => {
      // Woah, apparently running this code later fixes a Firefox textarea bug
      this.renderTaskQueue.add(() => {
        if (ev.inputType === "deleteContentBackward" || ev.inputType === "deleteWordBackward") {
          this.mathEditor.remove_at_caret("Left");
          this.updateInput();
        } else if (ev.inputType === "deleteContentForward" || ev.inputType === "deleteWordForward") {
          this.mathEditor.remove_at_caret("Right");
          this.updateInput();
        } else if (ev.inputType === "insertText") {
          const data = ev.data;
          if (data === null) return;
          const characters = unicodeSplit(data);
          MathEditorHelper.insertAtCaret(this.mathEditor, characters);
          this.updateInput();
        } else if (ev.inputType === "insertCompositionText") {
          // TODO: Handle it differently
        }
      });
    });

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
      this.mathEditor.remove_at_caret("Range");
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
    const getPointerPosition = (e: MouseEvent): MinimalInputRowPosition | null => {
      const newCaret = this.renderResult.getLayoutPosition({ x: e.clientX, y: e.clientY });
      if (!newCaret) return null;
      return {
        row_indices: newCaret.indices.indices.slice(),
        offset: newCaret.offset,
      };
    };

    let isPointerDown = false;

    container.addEventListener("pointerdown", (e) => {
      if (!e.isPrimary) return;
      const newPosition = getPointerPosition(e);
      if (!newPosition) return;
      container.setPointerCapture(e.pointerId);
      isPointerDown = true;
      this.mathEditor.start_selection(newPosition, "Char");
      this.renderCarets();
    });
    container.addEventListener("pointerup", (e) => {
      if (!e.isPrimary) return;
      isPointerDown = false;
      const newPosition = getPointerPosition(e);
      if (newPosition) {
        this.mathEditor.extend_selection(newPosition);
      }
      this.mathEditor.finish_selection();
      container.releasePointerCapture(e.pointerId);
      this.renderCarets();
    });
    container.addEventListener("pointercancel", (e) => {
      if (!e.isPrimary) return;
      isPointerDown = false;

      const newPosition = getPointerPosition(e);
      if (newPosition) {
        this.mathEditor.extend_selection(newPosition);
      }
      this.mathEditor.finish_selection();
      container.releasePointerCapture(e.pointerId);
      this.renderCarets();
    });
    // For double clicking
    // - The dblclick event fires too late for text selection (text selection should happen on pointerdown)
    // - The mouse event fires *after* the pointer event. And it includes the number of clicks info.
    container.addEventListener("mousedown", (e) => {
      if (!isPointerDown) return;

      const newPosition = getPointerPosition(e);
      if (!newPosition) return;

      const clickCount = e.detail;
      if (clickCount === 2) {
        // double click select
        this.mathEditor.start_selection(newPosition, "Word");
        this.renderCarets();
      } else if (clickCount === 3) {
        // triple click select
        this.mathEditor.start_selection(newPosition, "Line");
        this.renderCarets();
      }
    });
    container.addEventListener("pointermove", (e) => {
      if (!e.isPrimary) return;
      if (!isPointerDown) return;

      const newPosition = getPointerPosition(e);
      if (!newPosition) return;
      this.mathEditor.extend_selection(newPosition);
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
      const mathMlElement = htmlToElement(newValue || "<math></math>");
      assert(mathMlElement instanceof MathMLElement, "Mathml attribute must be a valid mathml element");

      const parsedInput = fromMathMLElement(mathMlElement);
      // TODO: Properly report errors
      if (parsedInput.errors.length > 0) {
        console.warn("Parsed input has errors", parsedInput.errors);
      }
      MathEditorHelper.spliceAtRange(
        this.mathEditor,
        {
          row_indices: [],
          start: this.syntaxTree.range.start,
          end: this.syntaxTree.range.end,
        },
        parsedInput.root.values
      );
      this.updateInput();
    } else {
      console.log("Attribute changed", name, oldValue, newValue);
    }
  }

  static get observedAttributes() {
    return ["mathml"];
  }

  /**
   * Updates the user input. Then reparses and rerenders the math formula.
   */
  updateInput() {
    this.syntaxTree = MathEditorHelper.getSyntaxTree(this.mathEditor);
    this.renderResult = this.renderer.renderAll({
      value: this.syntaxTree,
      errors: [],
    });
    console.log("Rendered", this.renderResult);

    // The MathML elements directly under the <math> tag
    const mathMlElements = this.renderResult.getElement(RowIndices.default()).getElements();
    for (const element of mathMlElements) {
      assert(element instanceof MathMLElement);
    }
    this.mathMlElement.replaceChildren(...mathMlElements);
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
    let carets = MathEditorHelper.getCaret(this.mathEditor);
    const caretElements = carets.map((caret) => {
      const element = new CaretDomElement();
      if (keyIn("Row", caret)) {
        const range = caret.Row;
        const caretIndices = new RowIndices(range.row_indices);
        const renderedCaret = this.renderResult.getViewportSelection({
          indices: caretIndices,
          start: range.start,
          end: range.end,
        });

        // Render caret itself
        const isForwards = range.start <= range.end;
        const caretSize = this.renderResult.getViewportCaretSize(caretIndices);
        element.setPosition({
          x: renderedCaret.rect.x + (isForwards ? renderedCaret.rect.width : 0),
          y: renderedCaret.baseline + caretSize * 0.1,
        });
        element.setHeight(caretSize);

        // Render selection
        element.clearSelections();
        const isCollapsed = range.start === range.end;
        if (!isCollapsed) {
          element.addSelection(renderedCaret.rect);
        }
      } else if (keyIn("Grid", caret)) {
        const range = caret.Grid;
        const startIndices = new RowIndices(range.row_indices).addRowIndex([range.index, range.leftOffset]);
        const renderedStart = this.renderResult.getViewportRowBounds(startIndices);
        const endIndices = new RowIndices(range.row_indices).addRowIndex([range.index, range.rightOffset]);
        const renderedEnd = this.renderResult.getViewportRowBounds(endIndices);
        element.clearSelections();
        element.addSelection(
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
        element.setHeight(0);
      } else {
        assertUnreachable(caret);
      }

      return element.element;
    });
    this.caretsContainer.replaceChildren(...caretElements);

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
    /*this.autocomplete.setElements(this.carets.autocompleteResults.flatMap((v) => v.result.potentialRules.map((v) => v.value)));
    const mainCaretBounds = this.carets.mainCaretBounds;
    if (mainCaretBounds) {
      this.autocomplete.setPosition({
        x: mainCaretBounds.x,
        y: mainCaretBounds.y + mainCaretBounds.height,
      });
    }*/
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
