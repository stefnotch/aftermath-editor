import "./style.css";
import { version } from "../package.json";
import { MathEditor } from "./component/math-editor";

// TODO: Remove those side effects or find a better way to do it
// See also https://vitejs.dev/guide/build.html#library-mode
customElements.define("math-editor", MathEditor);

document.querySelectorAll("math[data-editor]").forEach((el) => {
  const editor = document.createElement("math-editor");
  editor.setAttribute("mathml", el.outerHTML);
  el.replaceWith(editor);
});

if (import.meta.env.PROD) {
  console.log("Running version", version);
}

if (import.meta.env.DEV) {
  // Debug utility
  (window as any).displayBoundingRect = (el: { getBoundingClientRect(): DOMRect }) => {
    let rect = el.getBoundingClientRect();
    let display = document.createElement("div");
    display.style.position = "fixed";
    display.style.top = `${rect.top}px`;
    display.style.left = `${rect.left}px`;
    display.style.width = `${rect.width}px`;
    display.style.height = `${rect.height}px`;
    display.style.border = "1px solid red";
    display.style.pointerEvents = "none";
    document.body.append(display);
  };
}
