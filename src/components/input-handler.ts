export interface MathmlInputHandler {
  inputElement: HTMLElement;
  remove(): void;
}

export function createInputHandler(documentBody: HTMLElement): MathmlInputHandler {
  // See also https://github.com/stefnotch/quantum-sheet/blob/6b445476559ab5354b8a1c68c24a4ceb24e050e9/src/ui/QuantumDocument.vue#L23
  const inputElement = document.createElement("textarea");
  inputElement.autocomplete = "off";
  inputElement.spellcheck = false;
  inputElement.setAttribute("autocorrect", "off");
  inputElement.style.transform = "scale(0)";
  inputElement.style.resize = "none";
  inputElement.style.position = "absolute";
  inputElement.style.clipPath = "polygon(0 0)";
  inputElement.style.width = "0px";
  inputElement.style.height = "0px";
  inputElement.className = "math-input-area";
  documentBody.append(inputElement);

  function remove() {
    documentBody.removeChild(inputElement);
  }

  return {
    inputElement,
    remove,
  };
}
