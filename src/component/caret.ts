import { ViewportValue } from "./viewport-coordinate";

export interface CaretElement {
  setPosition(x: number, y: number): void;
  setHeight(v: number): void;
  setHighlightContainer(element: Element): void;
  remove(): void;
}

export function createCaret(container: HTMLElement): CaretElement {
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
  container.append(caretElement);

  let highlightContainer: Element | null = null;

  function setPosition(x: ViewportValue, y: ViewportValue) {
    const parentPos = container.getBoundingClientRect();

    caretElement.style.left = `${x - parentPos.left}px`;
    caretElement.style.top = `${y - parentPos.top}px`;
  }

  function setHeight(v: number) {
    caretElement.style.height = `${v}px`;
    // Grow from the bottom
    caretElement.style.marginTop = `${-v}px`;
  }

  function setHighlightContainer(element: Element | null) {
    highlightContainer?.classList.remove("math-container-highlight");
    highlightContainer = element;
    highlightContainer?.classList.add("math-container-highlight");
  }

  function remove() {
    setHighlightContainer(null);
    container.removeChild(caretElement);
  }

  return {
    setPosition,
    setHeight,
    setHighlightContainer,
    remove,
  };
}
