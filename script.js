import {
  createCursor,
  getTextLength,
  getLetterPosition,
  getElementBounds,
  indexInParent,
} from "./helpers.js";

[...document.querySelectorAll("math")].forEach(makeEditable);

/**
 * Takes a <math> element and makes it editable
 * @param {HTMLElement} mathElement
 */
function makeEditable(mathElement) {
  mathElement.style.userSelect = "none";
  mathElement.tabindex = "0";

  makeHoverable(mathElement);

  // If we click, we gotta do something
  mathElement.addEventListener("pointerdown", (ev) => {
    // TODO: This is a bit wrong. We need to find the closest element where stuff can actually be placed.
    setCursorTarget(ev.target);

    let boundingBox = getElementBounds(ev.target);

    // setCursorIndex according to the relative position in this element
    if (ev.pageX >= (boundingBox.left + boundingBox.right) / 2) {
      setCursorIndex(getChildrenLength(ev.target));
    } else {
      setCursorIndex(0);
    }
  });
}

/**
 * Takes a <math> element and adds a cute little hover indicator
 * @param {HTMLElement} mathElement
 */
function makeHoverable(mathElement) {
  let hoverTarget = null;

  function setHoverTarget(t) {
    if (hoverTarget) {
      hoverTarget.style.color = null;
      hoverTarget.style.outline = null;
    }
    hoverTarget = t;
    if (hoverTarget) {
      hoverTarget.style.color = "darkblue";
      hoverTarget.style.outline = "1px #000 solid";
    }
  }

  mathElement.addEventListener("pointerover", (ev) => {
    setHoverTarget(ev.target);
  });

  mathElement.addEventListener("pointerout", (ev) => {
    setHoverTarget(null);
  });
}
