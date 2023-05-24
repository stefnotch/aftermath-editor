import { RenderedSelection } from "../rendering/rendered-selection";
import { ViewportRect, ViewportValue } from "../rendering/viewport-coordinate";

export interface CaretElement {
  setPosition(x: number, y: number): void;
  setHeight(v: number): void;
  addSelection(rect: ViewportRect): void;
  setHighlightContainer(elements: ReadonlyArray<Element>): void;
  setToken(selection: RenderedSelection): void;
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

  const tokenHighlighter = document.createElement("div");
  tokenHighlighter.className = "caret-token-highlighter";
  container.append(tokenHighlighter);

  let highlightContainers: ReadonlyArray<Element> = [];

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

  function addSelection(rect: ViewportRect) {
    const parentPos = container.getBoundingClientRect();
    const selection = document.createElement("span");
    selection.className = "caret-selection";
    selection.style.position = "absolute";
    selection.style.left = `${rect.x - parentPos.left}px`;
    selection.style.top = `${rect.y - parentPos.top}px`;
    selection.style.width = `${rect.width}px`;
    selection.style.height = `${rect.height}px`;
    selectionsContainer.append(selection);
  }

  function setHighlightContainer(elements: ReadonlyArray<Element>) {
    highlightContainers.forEach((v) => v.classList.remove("caret-container-highlight"));
    highlightContainers = elements;
    highlightContainers.forEach((v) => v.classList.add("caret-container-highlight"));
  }

  function setToken(selection: RenderedSelection) {
    if (selection.isCollapsed) {
      tokenHighlighter.style.display = "none";
    } else {
      tokenHighlighter.style.display = "block";
      const parentPos = container.getBoundingClientRect();
      tokenHighlighter.style.left = `${selection.rect.x - parentPos.left}px`;
      tokenHighlighter.style.top = `${selection.rect.y - parentPos.top}px`;
      tokenHighlighter.style.width = `${selection.rect.width}px`;
      tokenHighlighter.style.height = `${selection.rect.height}px`;
    }
  }

  function clearSelections() {
    selectionsContainer.replaceChildren();
  }

  function remove() {
    setHighlightContainer([]);
    clearSelections();
    container.removeChild(caretElement);
    container.removeChild(selectionsContainer);
    container.removeChild(tokenHighlighter);
  }

  return {
    setPosition,
    setHeight,
    setHighlightContainer,
    setToken,
    addSelection,
    clearSelections,
    remove,
  };
}
