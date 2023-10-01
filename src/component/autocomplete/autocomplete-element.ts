import type { ViewportCoordinate } from "../../rendering/viewport-coordinate";
import { createNode } from "../../utils/dom-utils";

/**
 * There's only one autocomplete element.
 * However, the autocomplete logic is separate from the element. See caret instead.
 */
export class AutocompleteElement {
  #container: HTMLElement;
  #element: HTMLElement;
  #listElement: HTMLElement;

  // TODO: Autocompmlete token highlighter,
  // as in "underline the tokens belonging to the autocomplete".
  // Remember that different autocomplete results can have different ranges.

  constructor() {
    this.#container = createNode("div", {
      style: {
        position: "absolute",
      },
    });

    this.#element = createNode("div", {
      classList: ["autocomplete-container"],
      style: {
        position: "absolute",
      },
    });
    this.#container.append(this.#element);

    this.#listElement = createNode("ul", {});
    this.#element.append(this.#listElement);

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
