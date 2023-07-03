import type { ViewportCoordinate } from "../../rendering/viewport-coordinate";

/**
 * There's only one autocomplete element.
 * However, the autocomplete logic is separate from the element. See caret instead.
 */
export class AutocompleteElement {
  #container: HTMLElement;
  #element: HTMLElement;
  #listElement: HTMLElement;

  constructor() {
    const containerElement = document.createElement("div");
    containerElement.classList.add("autocomplete-container");
    containerElement.style.position = "absolute";
    this.#container = containerElement;

    const element = document.createElement("div");
    element.style.position = "absolute";
    containerElement.append(element);
    this.#element = element;

    const listElement = document.createElement("ul");
    element.append(listElement);
    this.#listElement = listElement;

    this.setVisibility(false);
  }

  get element(): HTMLElement {
    return this.#container;
  }

  private setVisibility(visible: boolean) {
    this.#container.style.display = visible ? "block" : "none";
    this.#element.style.display = visible ? "block" : "none";
  }

  setPosition(position: ViewportCoordinate) {
    const parentPos = this.#container.getBoundingClientRect();
    this.#element.style.left = `${position.x - parentPos.left}px`;
    this.#element.style.top = `${position.y - parentPos.top}px`;
  }

  setElements(elements: string[]) {
    this.#listElement.innerHTML = "";
    for (const element of elements) {
      const li = document.createElement("li");
      li.innerText = element;
      this.#listElement.append(li);
    }
    this.setVisibility(elements.length > 0);
  }
}
