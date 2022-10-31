import { ViewportCoordinate } from "./viewport-coordinate";

export interface MathmlCaret {
  setPosition(x: number, y: number): void;
  setHeight(v: number): void;
  remove(): void;
}

export function createCaret(documentBody: HTMLElement): MathmlCaret {
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
  caretElement.className = "math-caret";
  documentBody.appendChild(caretElement);

  function setPosition(x: ViewportCoordinate, y: ViewportCoordinate) {
    const parentPos = documentBody.getBoundingClientRect();

    caretElement.style.left = `${x - parentPos.left}px`;
    caretElement.style.top = `${y - parentPos.top}px`;
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
