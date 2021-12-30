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
      element.replaceChildren(...toMathMLElement(this.mathIR).children);
    };
  }
}
