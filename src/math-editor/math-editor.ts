import { assert } from "../assert";
import { MathIR } from "./math-ir";
import {
  fromElement as fromMathMLElement,
  toElement as toMathMLElement,
} from "./mathml-utils";

export class MathEditor {
  //carets: MathmlCaret[] = [];
  mathIR: MathIR;
  render: () => void;
  constructor(element: HTMLElement) {
    this.mathIR = fromMathMLElement(element);
    console.log(this.mathIR);

    this.render = () => {
      const newMathElement = toMathMLElement(this.mathIR);
      element.replaceChildren(...newMathElement.children);
      [...element.attributes].forEach((v) => element.removeAttribute(v.name));
      [...newMathElement.attributes].forEach((v) =>
        element.setAttribute(v.name, v.value)
      );
    };

    setTimeout(() => this.render(), 1000);
  }
}
