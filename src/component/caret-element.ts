import { ViewportValue } from "../rendering/viewport-coordinate";

export interface CaretElement {
  setPosition(x: number, y: number): void;
  setHeight(v: number): void;
  setHighlightContainer(element: Element): void;
  addSelection(x: number, y: number, width: number, height: number): void;
  clearSelections(): void;
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

  const selectionsContainer = document.createElement("div");
  selectionsContainer.style.position = "absolute";
  selectionsContainer.style.top = "0px";
  selectionsContainer.style.left = "0px";
  container.append(selectionsContainer);

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

  function addSelection(x: number, y: number, width: number, height: number) {
    const parentPos = container.getBoundingClientRect();
    const selection = document.createElement("span");
    selection.className = "math-selection";
    selection.style.position = "absolute";
    selection.style.left = `${x - parentPos.left}px`;
    selection.style.top = `${y - parentPos.top}px`;
    selection.style.width = `${width}px`;
    selection.style.height = `${height}px`;
    // Grow from the bottom
    selection.style.marginTop = `${-height}px`;
    selectionsContainer.append(selection);
  }

  function clearSelections() {
    selectionsContainer.replaceChildren();
  }

  function remove() {
    setHighlightContainer(null);
    clearSelections();
    container.removeChild(caretElement);
    container.removeChild(selectionsContainer);
  }

  return {
    setPosition,
    setHeight,
    setHighlightContainer,
    addSelection,
    clearSelections,
    remove,
  };
}
