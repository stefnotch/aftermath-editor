import {
  createCursor,
  getTextLength,
  getLetterPosition,
  getElementBounds,
  indexInParent,
} from "./helpers.js";

[...document.querySelectorAll("math")].forEach(makeEditable);

/**
 * Gets the text length for text-children and the number of elements otherwise
 * @param {HTMLElement} t
 */
function getChildrenLength(t) {
  if (isTextTagElement(t)) {
    return getTextLength(t);
  } else {
    if (t.childElementCount == 0) {
      return 0; // TODO: Or return 1? Hmm
    } else {
      return t.childElementCount;
    }
  }
}

/**
 * Takes a <math> element and makes it editable
 * @param {HTMLElement} mathElement
 */
function makeEditable(mathElement) {
  mathElement.style.userSelect = "none";
  mathElement.tabindex = "0";

  makeHoverable(mathElement);

  let cursorElement = createCursor();
  let caretLocations = [];
  addCaretLocations(caretLocations, mathElement);

  caretLocations.forEach((loc) => {
    let c = createCursor();
    c.setPosition(loc.x, loc.y);
    c.setHeight(loc.height);
  });

  // The index can be the index in the text, or it can be 0 (start) or 1 (end)
  let cursor = {
    cursorElement,
    caretLocation: caretLocations[0],
    index: 0,
  };

  function setCursorTarget(t) {
    cursor.target = t;
    setCursorIndex(0);
  }

  /**
   * Sets the letter-index of the cursor. Also moves the caret there.
   */
  function setCursorIndex(index) {
    cursor.index = index;
    if (cursor.target) {
      let targetBounds = getElementBounds(cursor.target);

      if (isTextTagElement(cursor.target)) {
        // Position it where the letter is
        let letterPosition = getLetterPosition(cursor.target, cursor.index);
        cursor.cursorElement.setPosition(letterPosition.x, letterPosition.y);
        cursor.cursorElement.setHeight(targetBounds.height);
      } else {
        let prevElement = move(cursor.target, cursor.index, getPrevious);
        let nextElement = move(cursor.target, cursor.index, getNext);

        let prevBounds = getElementBounds(prevElement.target);
        let nextBounds = getElementBounds(nextElement.target);

        // Use the average bounds
        cursor.cursorElement.setPosition(
          (prevBounds.x + prevBounds.width + nextBounds.x) / 2, // use the rightmost edge of the previous bounds
          (prevBounds.y + nextBounds.y) / 2
        );
        cursor.cursorElement.setHeight(
          (prevBounds.height + nextBounds.height) / 2
        );
      }
    } else {
      cursor.cursorElement.setPosition(0, 0);
      cursor.cursorElement.setHeight(0);
    }
  }

  // If we click, we gotta do something
  mathElement.addEventListener("pointerdown", (ev) => {
    /*if (!isTextTagElement(ev.target)) {
      // TODO: Maybe select the nearest such element?
      return;
    }*/

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

  // If we use the arrow keys, we gotta do something
  mathElement.addEventListener("keydown", (ev) => {
    if (!cursor.target) return;

    if (ev.key == "ArrowUp") {
      //navigate("Up");
    } else if (ev.key == "ArrowDown") {
      //navigate("Down");
    } else if (ev.key == "ArrowLeft") {
      let moveResult = move(cursor.target, cursor.index, getPrevious, false);
      setCursorTarget(moveResult.target);
      setCursorIndex(moveResult.index);
    } else if (ev.key == "ArrowRight") {
      let moveResult = move(cursor.target, cursor.index, getNext, false);
      setCursorTarget(moveResult.target);
      setCursorIndex(moveResult.index);
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
    /*if (!isTextTagElement(ev.target)) {
      // TODO: Maybe select the nearest such element?
      return;
    }*/
    setHoverTarget(ev.target);
  });

  mathElement.addEventListener("pointerout", (ev) => {
    setHoverTarget(null);
  });
}
