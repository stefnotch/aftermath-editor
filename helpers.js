/**
 * Creates a caret that can be positioned anywhere in the document.
 * The (x,y) refers to the top left corner of the caret.
 */
function createCursor() {
  let cursorElement = document.createElement("span");
  cursorElement.style.userSelect = "none";
  cursorElement.style.position = "absolute";
  cursorElement.style.height = "10px";
  cursorElement.style.width = "0px";
  cursorElement.style.margin = "0px";
  cursorElement.style.borderRightWidth = "0px";
  cursorElement.style.boxShadow = "0px 0px 0px 1px black";
  cursorElement.style.top = "0px";
  // Maybe add some cute blinking
  cursorElement.className = "math-cursor";
  document.body.appendChild(cursorElement);

  function setPosition(x, y) {
    cursorElement.style.left = `${x}px`;
    cursorElement.style.top = `${y}px`;
  }

  function setHeight(v) {
    cursorElement.style.height = `${v}px`;
  }

  function remove() {
    document.body.removeChild(cursorElement);
  }

  return {
    setPosition,
    setHeight,
    remove,
  };
}

/**
 * Returns the number of characters in a text-containing node.
 */
function getTextLength(t) {
  // TODO: A bit of a shoddy implementation
  return t.textContent.trim().length;
}

/**
 * Returns the document position of a letter in a text-containing node
 */
function getLetterPosition(t, index) {
  // https://stackoverflow.com/a/51618540/3492994

  // A better implementation would deal with the fact that a node can contain multiple text childs
  let range = document.createRange();
  range.setStart(t.firstChild, index);

  let boundingBox = range.getBoundingClientRect();

  return {
    x: boundingBox.x + window.scrollX,
    y: boundingBox.y + window.scrollY,
  };
}

/**
 * Returns the document bounds of an element
 * @param {HTMLElement} t
 * @returns DOMRect
 */
function getElementBounds(t) {
  let boundingBox = t.getBoundingClientRect();

  return new DOMRect(
    boundingBox.x + window.scrollX,
    boundingBox.y + window.scrollY,
    boundingBox.width,
    boundingBox.height
  );
}

/**
 *
 * @param {HTMLElement} t
 * @returns number
 */
function indexInParent(t) {
  // https://stackoverflow.com/a/23528539/3492994
  return Array.prototype.indexOf.call(t.parentElement.children, t);
}
