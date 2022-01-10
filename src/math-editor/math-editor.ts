import { assert } from "../assert";
import { MathAst } from "./math-ast";
import { MathIR, MathIRRow, MathIRTextLeaf } from "./math-ir";
import {
  fromElement as fromMathMLElement,
  toElement as toMathMLElement,
} from "./mathml-utils";

interface MathmlCaret {
  setPosition(x: number, y: number): void;
  setHeight(v: number): void;
  remove(): void;
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

  function remove() {
    documentBody.removeChild(caretElement);
  }

  return {
    setPosition,
    setHeight,
    remove,
  };
}

export class MathCaret {
  #row: MathIRRow | MathIRTextLeaf;
  #offset: number;
  #caretElement: MathmlCaret;

  constructor(row: MathIRRow, offset: number, caretElement: MathmlCaret) {
    this.#row = row;
    this.#offset = offset;
    this.#caretElement = caretElement;
  }

  render() {}

  remove() {
    this.#caretElement.remove();
  }
}

export class MathEditor {
  carets: MathCaret[] = [];
  mathAst: MathAst;
  render: () => void;
  constructor(element: HTMLElement) {
    this.mathAst = MathAst(fromMathMLElement(element));
    console.log(this.mathAst);

    this.carets.push(
      new MathCaret(this.mathAst.mathIR, 0, createCaret(document.body))
    );

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

    document.addEventListener("resize", () => {
      this.carets.forEach((v) => v.render());
    });

    this.render = () => {
      // TODO: Render caret
      // - Caret
      // - Highlight current element
      // - Highlight brackets

      const newMathElement = toMathMLElement(this.mathAst.mathIR);
      element.replaceChildren(...newMathElement.element.children);
      [...element.attributes].forEach((v) => element.removeAttribute(v.name));
      [...newMathElement.element.attributes].forEach((v) =>
        element.setAttribute(v.name, v.value)
      );
    };

    setTimeout(() => this.render(), 1000);
  }
}
