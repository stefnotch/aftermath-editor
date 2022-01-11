import { assert } from "../assert";
import { MathAst } from "./math-ast";
import { MathIR, MathIRLayout, MathIRRow, MathIRTextLeaf } from "./math-ir";
import {
  fromElement as fromMathMLElement,
  toElement as toMathMLElement,
} from "./mathml-utils";

interface MathmlCaret {
  setPosition(x: number, y: number): void;
  setHeight(v: number): void;
  destroy(): void;
}

function createCaret(documentBody: HTMLElement): MathmlCaret {
  const caretElement = document.createElement("span");
  caretElement.style.userSelect = "none";
  caretElement.style.position = "absolute";
  caretElement.style.height = "10px";
  caretElement.style.width = "0px";
  caretElement.style.margin = "0px";
  caretElement.style.borderRightWidth = "0px";
  caretElement.style.boxShadow = "0px 0px 0px 0.6px rgba(50, 50, 230, 50%)";
  caretElement.style.top = "0px";
  // Maybe add some cute blinking
  caretElement.className = "math-cursor";
  documentBody.appendChild(caretElement);

  function setPosition(x: number, y: number) {
    caretElement.style.left = `${x}px`;
    caretElement.style.top = `${y}px`;
  }

  function setHeight(v: number) {
    caretElement.style.height = `${v}px`;
  }

  function destroy() {
    documentBody.removeChild(caretElement);
  }

  return {
    setPosition,
    setHeight,
    destroy,
  };
}

function atEnd(row: MathIRRow | MathIRTextLeaf, offset: number) {
  if (row.type == "row") {
    return offset >= row.values.length;
  } else {
    return offset >= row.value.length;
  }
}

export interface MathCaret {
  row: MathIRRow | MathIRTextLeaf;
  offset: number;
  caretElement: MathmlCaret;
}

export class MathEditor {
  carets: Set<MathCaret> = new Set<MathCaret>();
  mathAst: MathAst;
  render: () => void;
  lastLayout: MathIRLayout | null = null;

  constructor(element: HTMLElement) {
    element.style.userSelect = "none";
    element.tabIndex = 0; // Should this be here or in mathml-utils.ts?

    this.mathAst = MathAst(fromMathMLElement(element));
    console.log(this.mathAst);

    this.carets.add({
      row: this.mathAst.mathIR,
      offset: 0,
      caretElement: createCaret(document.body),
    });

    // https://d-toybox.com/studio/lib/input_event_viewer.html
    // https://w3c.github.io/uievents/tools/key-event-viewer.html
    // https://tkainrad.dev/posts/why-keyboard-shortcuts-dont-work-on-non-us-keyboard-layouts-and-how-to-fix-it/

    // For now, I'll just use the following for text input
    // - Sneaky textarea or input field
    // - beforeInput event

    // Register keyboard handlers
    // TODO:
    // - Arrow keys (left right)
    // - up and down
    // - Backspace
    // - Delete
    // - Caret (superscript)
    // - Underscore (subscript)
    // - Letters and numbers
    // - Shift+arrow keys to select
    // - Shortcuts system (import a lib)

    // Register mouse handlers
    // - Click (put cursor)
    // - Drag (selection)

    element.addEventListener("keydown", (ev) => {
      console.log(ev);
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

    window.addEventListener("resize", () => this.renderCarets());

    this.render = () => {
      // TODO: Render caret
      // - Highlight current element
      // - Highlight brackets

      const newMathElement = toMathMLElement(this.mathAst.mathIR);
      this.lastLayout = newMathElement.mathIRLayout;
      element.replaceChildren(...newMathElement.element.children);
      [...element.attributes].forEach((v) => element.removeAttribute(v.name));
      [...newMathElement.element.attributes].forEach((v) =>
        element.setAttribute(v.name, v.value)
      );

      this.renderCarets();
    };

    setTimeout(() => this.render(), 1000);
  }

  renderCarets() {
    this.carets.forEach((v) => this.renderCaret(v));
  }

  renderCaret(caret: MathCaret) {
    const lastLayout = this.lastLayout;
    if (!lastLayout) return;

    const layoutGetter = lastLayout.get(caret.row);
    assert(layoutGetter !== undefined);
    const layout = layoutGetter(caret.offset);
    caret.caretElement.setPosition(layout.x, layout.y);
    caret.caretElement.setHeight(layout.height);
  }

  removeCaret(caret: MathCaret) {
    caret.caretElement.destroy();
    this.carets.delete(caret);
  }

  /**
   * Note: Make sure to re-render the caret after moving it
   */
  moveCaret(caret: MathCaret, direction: "up" | "down" | "left" | "right") {
    if (direction == "right") {
      if (atEnd(caret.row, caret.offset)) {
        // TODO:
        const parent = this.mathAst.parents.get(caret.row);
      } else {
        if (caret.row.type == "row") {
          // TODO:
          caret.offset += 1;
        } else {
          caret.offset += 1;
        }
      }
    } else if (direction == "left") {
      if (caret.offset <= 0) {
        const parent = this.mathAst.parents.get(caret.row);
        // TODO:
      } else {
        if (caret.row.type == "row") {
          // TODO:
          caret.offset -= 1;
        } else {
          caret.offset -= 1;
        }
      }
    }
  }

  destroy() {
    [...this.carets].forEach((v) => this.removeCaret(v));
    this.render = () => {};
    this.lastLayout = null;
  }
}
