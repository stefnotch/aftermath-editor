import { ViewportValue } from "../../rendering/viewport-coordinate";

export class AutocompleteElement {
  #element: HTMLElement;
  #listElement: HTMLElement;

  constructor() {
    const containerElement = document.createElement("div");
    containerElement.style.position = "absolute";
    this.#element = containerElement;

    const listElement = document.createElement("ul");
    containerElement.append(listElement);
    this.#listElement = listElement;
  }

  get element(): HTMLElement {
    return this.#element;
  }

  setPosition(x: ViewportValue, y: ViewportValue) {
    const parentPos = this.#element.getBoundingClientRect();
    this.#element.style.left = `${x - parentPos.left}px`;
    this.#element.style.top = `${y - parentPos.top}px`;
  }

  setElements(elements: string[]) {
    this.#listElement.innerHTML = "";
    for (const element of elements) {
      const li = document.createElement("li");
      li.innerText = element;
      this.#listElement.append(li);
    }
  }
}
