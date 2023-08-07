import type { ViewportCoordinate, ViewportRect } from "../../rendering/viewport-coordinate";
import { createNode } from "../../utils/dom-utils";

export class CaretDomElement {
  #element: HTMLElement;

  #caretElement: HTMLElement;
  #selectionsContainer: HTMLElement;

  constructor() {
    const containerElement = document.createElement("div");
    containerElement.style.position = "absolute";

    const caretElement = document.createElement("span");
    caretElement.className = "caret";
    this.#caretElement = caretElement;
    containerElement.append(caretElement);

    const selectionsContainer = document.createElement("div");
    selectionsContainer.style.position = "absolute";
    selectionsContainer.style.top = "0px";
    selectionsContainer.style.left = "0px";
    this.#selectionsContainer = selectionsContainer;
    containerElement.append(selectionsContainer);

    this.#element = containerElement;
  }

  get element(): HTMLElement {
    return this.#element;
  }

  setPosition(position: ViewportCoordinate) {
    const parentPos = this.#element.getBoundingClientRect();
    this.#caretElement.style.left = `${position.x - parentPos.left}px`;
    this.#caretElement.style.top = `${position.y - parentPos.top}px`;
  }

  getBounds(): ViewportRect | null {
    const position = this.#caretElement.getBoundingClientRect();
    return {
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
    };
  }

  setHeight(v: number) {
    if (v <= 0) {
      this.#caretElement.style.display = "none";
    } else {
      this.#caretElement.style.display = "";
    }
    this.#caretElement.style.height = `${v}px`;
    // Grow from the bottom
    this.#caretElement.style.marginTop = `${-v}px`;
  }

  addSelection(rect: ViewportRect) {
    const parentPos = this.#element.getBoundingClientRect();
    const selection = createNode("span", {
      className: "caret-selection",
      style: {
        position: "absolute",
        left: `${rect.x - parentPos.left}px`,
        top: `${rect.y - parentPos.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      },
    });
    this.#selectionsContainer.append(selection);
  }

  clearSelections() {
    this.#selectionsContainer.replaceChildren();
  }
}
