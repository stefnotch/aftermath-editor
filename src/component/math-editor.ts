import { assert, assertUnreachable } from "../utils/assert";
import { MathLayoutElement, MathLayoutRow, MathLayoutText } from "../math-layout/math-layout";
import { fromElement as fromMathMLElement } from "../mathml/parsing";
import { MathmlLayout, toElement as toMathMLElement } from "../mathml/rendering";
import arrayUtils from "../utils/array-utils";
import { endingBrackets, startingBrackets } from "../mathml/mathml-spec";
import { findOtherBracket, wrapInRow } from "../math-layout/math-layout-utils";
import { MathJson, toMathJson } from "../math-editor/math-ir";
import caretStyles from "./caret-styles.css?inline";
import mathEditorStyles from "./math-editor-styles.css?inline";
import inputHandlerStyles from "./input-handler-style.css?inline";
import { createCaret, CaretElement } from "./caret";
import { createInputHandler, MathmlInputHandler } from "./input-handler";
import { CaretEdit, MathLayoutCaret, moveCaret, removeAtCaret } from "./math-layout-caret";
import { MathLayoutRowZipper, MathLayoutTextZipper } from "../math-layout/math-layout-zipper";
import { tagIs } from "../utils/dom-utils";
import { applyEdit, MathLayoutEdit } from "./math-layout-edit";

export interface MathCaret {
  caret: MathLayoutCaret;
  element: CaretElement;
}

function createElementFromHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.firstChild;
}

export class MathEditor extends HTMLElement {
  carets: Set<MathCaret> = new Set<MathCaret>();

  // TODO: Rename mathAst to something (the name is a leftover from the old math-ast with parent pointers design)
  mathAst: MathLayoutRowZipper;

  render: () => void;
  createCaret: (zipper: MathLayoutRowZipper | MathLayoutTextZipper, offset: number) => MathCaret;
  lastLayout: MathmlLayout | null = null;
  inputHandler: MathmlInputHandler;

  mathMlElement: ChildNode;

  redoStack: MathLayoutEdit[] = [];

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: "open" });

    // Position carets absolutely, relative to the math formula
    const caretContainer = document.createElement("span");
    caretContainer.style.position = "absolute";

    // Input handler container
    const inputContainer = document.createElement("span");
    inputContainer.style.position = "absolute";
    this.inputHandler = createInputHandler(inputContainer);

    // Container for math formula
    const container = document.createElement("span");
    container.style.display = "inline-block"; // Needed for the resize observer
    container.style.userSelect = "none";
    container.tabIndex = 0;

    // Click to focus
    container.addEventListener("focus", () => {
      this.inputHandler.inputElement.focus();
    });

    container.addEventListener("pointerdown", (e) => {
      const lastLayout = this.lastLayout;
      if (!lastLayout) return;

      const isElementTarget = e.target instanceof Element || e.target instanceof Text;
      if (!isElementTarget) return;
      const newCaret = lastLayout.positionToCaret(e.target, { x: e.clientX, y: e.clientY }, this.mathAst);
      if (!newCaret) return;

      console.log(e.target);

      this.removeAllCarets();
      this.carets.add(this.createCaret(newCaret.zipper, newCaret.offset));
      this.renderCarets();
    });

    // Resize - rerender carets in correct locations
    const editorResizeObserver = new ResizeObserver(() => {
      this.renderCarets();
    });
    editorResizeObserver.observe(container, { box: "border-box" });

    // Mathml DOM element
    this.mathMlElement = document.createElement("math");
    container.append(this.mathMlElement);

    // Math formula
    this.mathAst = new MathLayoutRowZipper({ type: "row", values: [] }, null, 0);

    // Caret creation function
    this.createCaret = (zipper: MathLayoutRowZipper | MathLayoutTextZipper, offset: number) => ({
      caret: new MathLayoutCaret(zipper, offset),
      element: createCaret(caretContainer),
    });

    // https://d-toybox.com/studio/lib/input_event_viewer.html
    // https://w3c.github.io/uievents/tools/key-event-viewer.html
    // https://tkainrad.dev/posts/why-keyboard-shortcuts-dont-work-on-non-us-keyboard-layouts-and-how-to-fix-it/

    // TODO: Parsing
    // - 1. MathLayout
    // - 2. Bracket pairs
    // - 3. A general enough recursive descent (or pratt) parser that can handle tokens

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

    this.inputHandler.inputElement.addEventListener("keydown", (ev) => {
      console.info(ev);
      if (ev.key == "ArrowUp") {
        this.carets.forEach((caret) => this.moveCaret(caret, "up"));
        this.renderCarets();
      } else if (ev.key == "ArrowDown") {
        this.carets.forEach((caret) => this.moveCaret(caret, "down"));
        this.renderCarets();
      } else if (ev.key == "ArrowLeft") {
        this.carets.forEach((caret) => this.moveCaret(caret, "left"));
        this.renderCarets();
      } else if (ev.key == "ArrowRight") {
        this.carets.forEach((caret) => this.moveCaret(caret, "right"));
        this.renderCarets();
      }
    });

    this.inputHandler.inputElement.addEventListener("beforeinput", (ev) => {
      console.info(ev);
      const lastLayout = this.lastLayout;
      if (!lastLayout) return; // TODO: Maybe don't ignore the input command if the last layout doesn't exist?

      if (ev.inputType == "deleteContentBackward" || ev.inputType == "deleteWordBackward") {
        const edit = this.recordEdit([...this.carets].map((v) => removeAtCaret(v.caret, "left", lastLayout)));
        this.saveEdit(edit);
        this.applyEdit(edit);
      } else if (ev.inputType == "deleteContentForward" || ev.inputType == "deleteWordForward") {
        const edit = this.recordEdit([...this.carets].map((v) => removeAtCaret(v.caret, "right", lastLayout)));
        this.saveEdit(edit);
        this.applyEdit(edit);
      } else if (ev.inputType == "insertText") {
        const data = ev.data;
        if (data != null) {
          this.carets.forEach((caret) => this.insertAtCaret(caret, data));
        }
        this.render();
      }
    });

    this.render = () => {
      if (!this.isConnected) return;
      const newMathLayout = toMathMLElement(this.mathAst.value /** TODO: Use MathIR here */);
      this.lastLayout = newMathLayout;
      this.setMathMl(newMathLayout.element);
      // Don't copy the attributes

      try {
        console.log(
          toMathJson(this.mathAst.value /** TODO: Use MathIR here */, [
            {
              bindingPower: [null, null],
              tokens: [
                {
                  type: "symbol",
                  value: "x",
                },
              ],
              mathJson: () => ["Symbol", { sym: "x" }],
            },
            {
              bindingPower: [null, null],
              tokens: [
                {
                  type: "symbol",
                  value: "y",
                },
              ],
              mathJson: () => ["Symbol", { sym: "y" }],
            },
            {
              bindingPower: [null, 9],
              tokens: [
                {
                  type: "symbol",
                  value: "-",
                },
              ],
              // TODO: Negate?
              mathJson: () => ["Symbol", { sym: "-" }],
            },
            {
              bindingPower: [null, null],
              tokens: [
                {
                  type: "symbol",
                  value: "2",
                },
              ],
              // TODO: 2
              mathJson: () => ["Symbol", { sym: "2" }],
            },
            {
              bindingPower: [5, 6],
              tokens: [
                {
                  type: "symbol",
                  value: "+",
                },
              ],
              // TODO: Plus or Add?
              mathJson: () => ["Symbol", { sym: "+" }],
            },
            {
              bindingPower: [7, 8],
              tokens: [
                {
                  type: "symbol",
                  value: "*",
                },
              ],
              // TODO: Multiply or Times?
              mathJson: () => ["Symbol", { sym: "*" }],
            },
          ])
        );
      } catch (e) {
        console.log("couldn't parse ", e);
      }

      this.renderCarets();
    };

    const styles = document.createElement("style");
    styles.textContent = `${mathEditorStyles}\n ${inputHandlerStyles}\n ${caretStyles}`;
    shadowRoot.append(styles, caretContainer, inputContainer, container);
  }

  connectedCallback() {
    // Try to initialize the math element
    this.attributeChangedCallback("mathml", "", this.getAttribute("mathml") ?? "");
    this.render();
  }

  disconnectedCallback() {
    // So far, everything gets cleaned up automatically
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    console.log("Attribute changed", name, oldValue, newValue);
    if (name === "mathml") {
      const mathMlElement = createElementFromHtml(newValue || "<math></math>");
      assert(mathMlElement instanceof MathMLElement, "Mathml attribute must be a valid mathml element");
      this.setMathMl(mathMlElement);

      this.mathAst = new MathLayoutRowZipper(fromMathMLElement(mathMlElement), null, 0);
      this.removeAllCarets();
      this.carets.add(this.createCaret(this.mathAst, 0));

      console.log(this.mathAst);
      this.render();
    }
  }

  static get observedAttributes() {
    return ["mathml"];
  }

  renderCarets() {
    if (!this.isConnected) return;
    this.carets.forEach((v) => this.renderCaret(v));
  }

  renderCaret(caret: MathCaret) {
    const lastLayout = this.lastLayout;
    if (!lastLayout) return;

    const layout = lastLayout.caretToPosition(caret.caret.zipper, caret.caret.offset);
    caret.element.setPosition(layout.x, layout.y);
    caret.element.setHeight(layout.height);

    const container = lastLayout.caretContainer(caret.caret.zipper);
    caret.element.setHighlightContainer(container);
  }

  removeCaret(caret: MathCaret) {
    caret.element.remove();
    this.carets.delete(caret);
  }

  removeAllCarets() {
    this.carets.forEach((c) => c.element.remove());
    this.carets.clear();
  }

  recordEdit(edits: readonly CaretEdit[]): MathLayoutEdit {
    const caretsBefore = [...this.carets].map((v) => MathLayoutCaret.serialize(v.caret.zipper, v.caret.offset));

    return {
      type: "multi",
      edits: edits.flatMap((v) => v.edits),
      caretsBefore,
      caretsAfter: edits.map((v) => v.caret),
    };
  }

  saveEdit(edit: MathLayoutEdit) {
    if (edit.edits.length > 0) {
      this.redoStack.push(edit);
    }
  }

  applyEdit(edit: MathLayoutEdit) {
    this.removeAllCarets();

    const result = applyEdit(this.mathAst, edit);

    this.mathAst = result.root;

    // TODO: Deduplicate carets
    result.carets.forEach((v) => {
      this.carets.add(this.createCaret(v.zipper, v.offset));
    });

    this.render();
  }

  /**
   * Note: Make sure to re-render the caret after moving it
   */
  moveCaret(caret: MathCaret, direction: "up" | "down" | "left" | "right") {
    const lastLayout = this.lastLayout;
    if (!lastLayout) return; // TODO: Maybe don't ignore the move command if the last layout doesn't exist?

    const newCaret = moveCaret(caret.caret, direction, lastLayout);
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

  setMathMl(mathMl: MathMLElement) {
    assert(mathMl instanceof MathMLElement);
    assert(tagIs(mathMl, "math"));
    this.mathMlElement.replaceWith(mathMl);
    this.mathMlElement = mathMl;
  }
}
