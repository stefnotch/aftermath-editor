import { assert } from "../assert";
import { MathIR } from "./math-ir";
import { fromElement as fromMathMLElement } from "./mathml-utils";

export class MathEditor {
  //carets: MathmlCaret[] = [];
  mathIR: MathIR;
  constructor(element: HTMLElement) {
    this.mathIR = fromMathMLElement(element);
    console.log(this.mathIR);
  }
}
