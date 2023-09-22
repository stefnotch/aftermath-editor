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
  getGridRow,
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
        cursor: "text",
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

    this.addPointerEventListeners(container, () => this.inputHandler.focus());
    this.addInputEventListeners();
    // Click to focus
    container.addEventListener("focus", () => this.inputHandler.focus());

    this.autocomplete = new AutocompleteElement();
    inputContainer.appendChild(this.autocomplete.element);

    // Rendering
    this.renderer = new MathMLRenderer();
    MathEditorHelper.getRuleNames(this.mathEditor).forEach((name) => {
      assert(this.renderer.canRender(name), "Cannot render " + joinNodeIdentifier(name) + ".");
    });

    this.syntaxTree = MathEditorHelper.getSyntaxTree(this.mathEditor);
    this.renderResult = this.renderer.renderAll({
      errors: null,
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
          this.mathEditor.remove_at_caret("Left", "Char");
          this.updateInput();
        } else if (ev.inputType === "deleteContentForward" || ev.inputType === "deleteWordForward") {
          this.mathEditor.remove_at_caret("Right", "Char");
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

    const handleCopy = (clipboard: DataTransfer) => {
      clipboard.setData("application/json", this.mathEditor.copy("JsonInputTree"));
    };

    this.inputHandler.element.addEventListener("copy", (ev) => {
      if (ev.clipboardData === null) {
        console.error("No clipboard data");
        return;
      }
      handleCopy(ev.clipboardData);
      ev.preventDefault();
    });

    this.inputHandler.element.addEventListener("cut", (ev) => {
      if (ev.clipboardData === null) {
        console.error("No clipboard data");
        return;
      }
      handleCopy(ev.clipboardData);
      ev.preventDefault();
      this.mathEditor.remove_at_caret("Range", "Char");
      this.updateInput();
    });

    this.inputHandler.element.addEventListener("paste", (ev) => {
      if (ev.clipboardData === null) {
        console.error("No clipboard data");
        return;
      }
      const json = ev.clipboardData.getData("application/json");
      if (json) {
        this.mathEditor.paste(json, "JsonInputTree");
      } else {
        const text = ev.clipboardData.getData("text/plain");
        // Assume that it's also a JsonInputTree
        this.mathEditor.paste(text, "JsonInputTree");
      }
      this.updateInput();
    });
  }

  private addPointerEventListeners(container: HTMLSpanElement, focusCallback: () => void) {
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
      focusCallback();
      isPointerDown = true;
      this.mathEditor.start_selection(newPosition, "Char");
      this.updateInput();
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
    console.log("about to get the syntax tree for", MathEditorHelper.getInputTree(this.mathEditor));
    this.syntaxTree = MathEditorHelper.getSyntaxTree(this.mathEditor);
    this.renderResult = this.renderer.renderAll({
      value: this.syntaxTree,
      errors: null,
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
    this.caretsContainer.replaceChildren();
    for (const caret of carets) {
      const element = new CaretDomElement();
      this.caretsContainer.append(element.element);
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
        const topLeftOffset = {
          x: Math.min(range.start.x, range.end.x),
          y: Math.min(range.start.y, range.end.y),
        };
        const bottomRightOffset = {
          x: Math.max(range.start.x, range.end.x),
          y: Math.max(range.start.y, range.end.y),
        };
        const startIndices = new RowIndices(getGridRow(this.syntaxTree, range.row_indices, range.index, topLeftOffset));
        const renderedStart = this.renderResult.getViewportRowBounds(startIndices);
        const endIndices = new RowIndices(
          getGridRow(this.syntaxTree, range.row_indices, range.index, {
            x: Math.max(0, bottomRightOffset.x - 1),
            y: Math.max(0, bottomRightOffset.y - 1),
          })
        );
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
    }

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
}
