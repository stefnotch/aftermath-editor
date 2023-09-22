import { createNode } from "../../utils/dom-utils";

export class InputHandlerElement {
  #element: HTMLTextAreaElement;

  constructor() {
    const isVisible = false;

    // See also https://github.com/stefnotch/quantum-sheet/blob/6b445476559ab5354b8a1c68c24a4ceb24e050e9/src/ui/QuantumDocument.vue#L23
    const element = createNode("textarea", {
      classList: ["input-textarea", "math-input-area"],
      autocomplete: "off",
      spellcheck: false,
      attributes: {
        autocorrect: "off",
      },
    });

    if (isVisible) {
      element.style.transform = "scale(1)";
      element.style.width = "30px";
      element.style.height = "30px";
      element.style.clipPath = "none";
    }
    this.#element = element;
  }

  focus() {
    this.#element.focus();
  }

  get element(): HTMLElement {
    return this.#element;
  }
}
