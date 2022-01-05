import { MathIR } from "./math-ir";

export function optionalWrapInRow(mathIR: MathIR | MathIR[]): MathIR {
  // TODO: What if I get an array with the length 1?
  if (Array.isArray(mathIR)) {
    return {
      type: "row",
      values: mathIR,
    };
  } else {
    return mathIR;
  }
}

export function expectNChildren(element: Element, n: number): MathIR | null {
  if (element.children.length != n) {
    return {
      type: "error",
      value: `Expected ${n} children in ${element.tagName.toLowerCase()}`,
    };
  }
  return null;
}
