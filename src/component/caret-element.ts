import { RenderedSelection } from "../rendering/rendered-selection";
import { ViewportRect, ViewportValue } from "../rendering/viewport-coordinate";

export class CaretElement {
  #element: HTMLElement;

  #caretElement: HTMLElement;
  #selectionsContainer: HTMLElement;
  #tokenHighlighter: HTMLElement;

  constructor() {
    const containerElement = document.createElement("div");
    containerElement.style.position = "absolute";

    const caretElement = document.createElement("span");
    caretElement.style.userSelect = "none";
    caretElement.style.position = "absolute";
    caretElement.style.height = "10px";
    caretElement.style.width = "0px";
    caretElement.style.margin = "0px";
    caretElement.style.borderRightWidth = "0px";
    caretElement.style.boxShadow = "0px 0px 0px 0.6px rgba(50, 50, 230, 50%)";
    caretElement.style.top = "0px";
    // TODO: Maybe add some cute blinking
    caretElement.className = "math-caret";
    this.#caretElement = caretElement;
    containerElement.append(caretElement);

    const selectionsContainer = document.createElement("div");
    selectionsContainer.style.position = "absolute";
    selectionsContainer.style.top = "0px";
    selectionsContainer.style.left = "0px";
    this.#selectionsContainer = selectionsContainer;
    containerElement.append(selectionsContainer);

    const tokenHighlighter = document.createElement("div");
    tokenHighlighter.className = "caret-token-highlighter";
    this.#tokenHighlighter = tokenHighlighter;
    containerElement.append(tokenHighlighter);

    this.#element = containerElement;
  }

  get element(): HTMLElement {
    return this.#element;
  }

  setPosition(x: ViewportValue, y: ViewportValue) {
    const parentPos = this.#element.getBoundingClientRect();
    this.#caretElement.style.left = `${x - parentPos.left}px`;
    this.#caretElement.style.top = `${y - parentPos.top}px`;
  }

  setHeight(v: number) {
    this.#caretElement.style.height = `${v}px`;
    // Grow from the bottom
    this.#caretElement.style.marginTop = `${-v}px`;
  }

  addSelection(rect: ViewportRect) {
    const parentPos = this.#element.getBoundingClientRect();
    const selection = document.createElement("span");
    selection.className = "caret-selection";
    selection.style.position = "absolute";
    selection.style.left = `${rect.x - parentPos.left}px`;
    selection.style.top = `${rect.y - parentPos.top}px`;
    selection.style.width = `${rect.width}px`;
    selection.style.height = `${rect.height}px`;
    this.#selectionsContainer.append(selection);
  }

  setToken(selection: RenderedSelection) {
    if (selection.isCollapsed) {
      this.#tokenHighlighter.style.display = "none";
    } else {
      this.#tokenHighlighter.style.display = "block";
      const parentPos = this.#element.getBoundingClientRect();
      this.#tokenHighlighter.style.left = `${selection.rect.x - parentPos.left}px`;
      this.#tokenHighlighter.style.top = `${selection.rect.y - parentPos.top}px`;
      this.#tokenHighlighter.style.width = `${selection.rect.width}px`;
      this.#tokenHighlighter.style.height = `${selection.rect.height}px`;
    }
  }

  clearSelections() {
    this.#selectionsContainer.replaceChildren();
  }
}
