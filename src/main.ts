import "./style.css";
import { version } from "../package.json";
import { MathEditor } from "./component/math-editor";
customElements.define("math-editor", MathEditor);

document.querySelectorAll("math[data-editor]").forEach((el) => {
  const editor = document.createElement("math-editor");
  editor.setAttribute("mathml", el.outerHTML);
  el.replaceWith(editor);
});

if (import.meta.env.PROD) {
  console.log("Running version", version);
}
