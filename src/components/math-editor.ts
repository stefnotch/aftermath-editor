import { assert, assertUnreachable } from "../utils/assert";
import { MathAst } from "../math-editor/math-ast";
import { MathLayoutElement, MathPhysicalLayout, MathLayoutRow, MathLayoutText } from "../math-editor/math-layout/math-layout";
import { fromElement as fromMathMLElement, toElement as toMathMLElement } from "../math-editor/mathml-converter";
import arrayUtils from "../utils/array-utils";
import { endingBrackets, startingBrackets } from "../math-editor/mathml-spec";
import { findOtherBracket, wrapInRow } from "../math-editor/math-layout/math-layout-utils";
import { MathJson, toMathJson } from "../math-editor/math-ir";
import caretStyles from "./caret-styles.css?inline";
import mathEditorStyles from "./math-editor-styles.css?inline";
import inputHandlerStyles from "./input-handler-style.css?inline";
import { createCaret, CaretElement } from "./caret";
import { createInputHandler, MathmlInputHandler } from "./input-handler";
import { MathLayoutCaret } from "./math-layout-caret";
import { MathLayoutRowZipper } from "../math-editor/math-layout/math-layout-zipper";

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
  lastLayout: MathPhysicalLayout | null = null;
  inputHandler: MathmlInputHandler;

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    // So far, everything gets cleaned up automatically
  }

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: "open" });

    // Position carets absolutely, relative to the math formula
    const caretContainer = document.createElement("span");
    caretContainer.style.position = "absolute";

    // Input handler container
    const inputContainer = document.createElement("span");
    inputContainer.style.position = "absolute";

    // Container for math formula
    const container = document.createElement("span");
    container.style.display = "inline-block"; // Needed for the resize observer

    const mathMlElement = createElementFromHtml(this.getAttribute("mathml") || "");
    assert(mathMlElement instanceof MathMLElement, "Mathml attribute must be a valid mathml element");
    mathMlElement.style.userSelect = "none";
    mathMlElement.style.display = "inline";
    mathMlElement.style.fontFamily = "STIX Two";
    mathMlElement.tabIndex = 0;
    container.append(mathMlElement);

    this.mathAst = new MathLayoutRowZipper(fromMathMLElement(mathMlElement), null, 0);
    console.log(this.mathAst);

    this.carets.add({
      caret: new MathLayoutCaret(this.mathAst, 0),
      element: createCaret(caretContainer),
    });

    this.inputHandler = createInputHandler(inputContainer);

    // https://d-toybox.com/studio/lib/input_event_viewer.html
    // https://w3c.github.io/uievents/tools/key-event-viewer.html
    // https://tkainrad.dev/posts/why-keyboard-shortcuts-dont-work-on-non-us-keyboard-layouts-and-how-to-fix-it/

    // TODO: Parsing
    // - 1. MathLayout
    // - 2. Bracket pairs
    // - 3. A general enough recursive descent (or pratt) parser that can handle tokens

    // Register keyboard handlers
    // TODO:
    // - turning it into a web-component is required for some of the items below
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
    mathMlElement.addEventListener("focus", (ev) => {
      this.inputHandler.inputElement.focus();
    });

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
      if (ev.inputType == "deleteContentBackward" || ev.inputType == "deleteWordBackward") {
        this.carets.forEach((caret) => this.deleteAtCaret(caret, "left"));
        this.render();
      } else if (ev.inputType == "deleteContentForward" || ev.inputType == "deleteWordForward") {
        this.carets.forEach((caret) => this.deleteAtCaret(caret, "right"));
        this.render();
      } else if (ev.inputType == "insertText") {
        const data = ev.data;
        if (data != null) {
          this.carets.forEach((caret) => this.insertAtCaret(caret, data));
        }
        this.render();
      }
    });

    const editorResizeObserver = new ResizeObserver(() => {
      this.renderCarets();
    });
    editorResizeObserver.observe(container, { box: "border-box" });

    this.render = () => {
      const newMathElement = toMathMLElement(this.mathAst.value /** TODO: Use MathIR here */);
      this.lastLayout = newMathElement.physicalLayout;
      mathMlElement.replaceChildren(...newMathElement.element.children);
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

  renderCarets() {
    this.carets.forEach((v) => this.renderCaret(v));
  }

  renderCaret(caret: MathCaret) {
    const lastLayout = this.lastLayout;
    if (!lastLayout) return;

    const layoutGetter = lastLayout.get(caret.caret.zipper.value);
    assert(layoutGetter !== undefined);
    const layout = layoutGetter(caret.caret.offset);
    caret.element.setPosition(layout.x, layout.y);
    caret.element.setHeight(layout.height);

    // TODO: Highlight current element
    // - if inside sqrt, highlight that
    // - if inside text, highlight that
    // - if next to variable, highlight it and all occurrences
    // - if next to bracket, highlight it and its pair
  }

  removeCaret(caret: MathCaret) {
    caret.element.remove();
    this.carets.delete(caret);
  }

  /**
   * Note: Make sure to re-render the caret after moving it
   */
  moveCaret(caret: MathCaret, direction: "up" | "down" | "left" | "right") {
    const newCaret = caret.caret.move(direction);
    if (newCaret) {
      caret.caret = newCaret;
    }
  }

  /**
   * Gets the element that the caret is "touching"
   */
  getElementAtCaret(caret: MathCaret, direction: "left" | "right"): MathLayoutElement | null {
    if (caret.row.type == "row") {
      const elementIndex = caret.offset + (direction == "left" ? -1 : 0);
      return arrayUtils.get(caret.row.values, elementIndex) ?? null;
    } else {
      return null;
    }
  }

  /**
   * Note: Make sure to re-render after deleting
   */
  deleteAtCaret(caret: MathCaret, direction: "left" | "right") {
    function removeButKeepChildren(
      mathAst: MathAst,
      toRemove: MathLayoutElement,
      children: MathLayoutElement[]
    ): { parent: MathLayoutRow; indexInParent: number } {
      const { parent, indexInParent } = mathAst.getParentAndIndex(toRemove);
      assert(parent != null);
      for (let i = 0; i < children.length; i++) {
        mathAst.insertChild(parent, children[i], indexInParent + i);
      }
      mathAst.removeChild(parent, toRemove);
      return { parent, indexInParent };
    }

    if (caret.row.type == "row") {
      // Row deletion
      const elementAtCaret = this.getElementAtCaret(caret, direction);
      if (elementAtCaret == null) {
        // At the start or end of a row
        const { parent, indexInParent } = this.mathAst.getParentAndIndex(caret.row);
        if (parent == null) return;
        if (parent.type == "fraction") {
          if ((indexInParent == 0 && direction == "left") || (indexInParent == 1 && direction == "right")) {
            this.moveCaret(caret, direction);
          } else {
            // Delete the fraction but keep its contents
            const parentContents = parent.values.flatMap((v) => v.values);
            const { parent: parentParent, indexInParent: indexInParentParent } = removeButKeepChildren(
              this.mathAst,
              parent,
              parentContents
            );

            caret.row = parentParent;
            caret.offset = indexInParentParent + parent.values[0].values.length;
          }
        } else if ((parent.type == "sup" || parent.type == "sub") && direction == "left") {
          // Delete the superscript/subscript but keep its contents
          const parentContents = parent.values.flatMap((v) => v.values);
          const { parent: parentParent, indexInParent: indexInParentParent } = removeButKeepChildren(
            this.mathAst,
            parent,
            parentContents
          );

          caret.row = parentParent;
          caret.offset = indexInParentParent;
        } else if (parent.type == "root") {
          if ((indexInParent == 0 && direction == "right") || (indexInParent == 1 && direction == "left")) {
            // Delete root but keep its contents
            const parentContents = parent.values[1].values;
            const { parent: parentParent, indexInParent: indexInParentParent } = removeButKeepChildren(
              this.mathAst,
              parent,
              parentContents
            );

            caret.row = parentParent;
            caret.offset = indexInParentParent;
          } else {
            this.moveCaret(caret, direction);
          }
        } else {
          this.moveCaret(caret, direction);
        }
      } else if (elementAtCaret.type == "symbol" || elementAtCaret.type == "bracket") {
        this.mathAst.removeChild(caret.row, elementAtCaret);
        if (direction == "left") {
          caret.offset -= 1;
        }
      } else if ((elementAtCaret.type == "sup" || elementAtCaret.type == "sub") && direction == "right") {
        // Delete the superscript/subscript but keep its contents
        const parentContents = elementAtCaret.values.flatMap((v) => v.values);
        const { parent: parentParent, indexInParent: indexInParentParent } = removeButKeepChildren(
          this.mathAst,
          elementAtCaret,
          parentContents
        );

        caret.row = parentParent;
        caret.offset = indexInParentParent;
      } else {
        this.moveCaret(caret, direction);
      }
    } else {
      // Text deletion
      if ((direction == "left" && caret.offset <= 0) || (direction == "right" && caret.offset >= caret.row.value.length)) {
        this.moveCaret(caret, direction);
      } else {
        if (direction == "left") {
          caret.row.value = caret.row.value.slice(0, caret.offset - 1) + caret.row.value.slice(caret.offset);
          caret.offset -= 1;
        } else {
          caret.row.value = caret.row.value.slice(0, caret.offset) + caret.row.value.slice(caret.offset + 1);
        }
      }
    }
  }

  /**
   * User typed some text
   */
  insertAtCaret(caret: MathCaret, text: string) {
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
}
