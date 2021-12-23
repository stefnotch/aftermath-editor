import {
  createCursor,
  getTextLength,
  getLetterPosition,
  getElementBounds,
  indexInParent,
} from "./helpers.js";

[...document.querySelectorAll("math")].forEach(makeEditable);

function CaretLocation(x, y, height) {
  this.x = x;
  this.y = y;
  this.height = height;
  return this;
}

// TODO: Caret height is a function of scriptlevel(current node). In the case of the browser, we can use the computed font-size
// TODO: Write documentation about the algorithm
/**
 * MathML can be separated into text-containing nodes and other nodes.
 * When editing the mathematical part, we almost exclusively care about the text containing nodes
 * The other nodes are useful for navigating and for figuring out the structure.
 */
const textTagNames = ["mtext", "mi", "mn", "mo", "mspace", "ms"];

/**
 * Checks if this element is one of the text containing MathML elements
 * @param {HTMLElement} t
 */
function isTextTagElement(t) {
  if (!t) return;

  return textTagNames.includes(t.tagName.toLowerCase());
}

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

// TODO: moveRight and moveLeft functions, using the info above
// And the also moveUp and moveDown

function getPrevious(target, index) {
  // If we can move inside the text, we do that
  if (isTextTagElement(target) && index - 1 >= 0) {
    return {
      target,
      index: index - 1,
      type: classifyEdge(target, index - 1),
    };
  }

  if (index <= 0) {
    // We're at the end (it's important to first check this, otherwise empty text nodes might cause issues)
    // So we step out of this element, into the parent
    let parentIndex = indexInParent(target);
    return {
      target: target.parentElement,
      index: parentIndex,
      type: classifyEdge(target, parentIndex),
    };
  } else {
    // The cursor is in a non-text node. So we check out the next interesting child and step into it
    let nextChildElement = target.children[index - 1];
    let childIndex = getChildrenLength(nextChildElement);
    return {
      target: nextChildElement,
      index: childIndex,
      type: classifyEdge(nextChildElement, childIndex),
    };
  }
}

function getNext(target, index) {
  // If we can move inside the text, we do that
  if (isTextTagElement(target) && index + 1 <= getChildrenLength(target)) {
    return {
      target,
      index: index + 1,
      type: classifyEdge(target, index + 1),
    };
  }

  if (index >= getChildrenLength(target)) {
    // We're at the end (it's important to first check this, otherwise empty text nodes might cause issues)
    // So we step out of this element, into the parent
    let parentIndex = indexInParent(target) + 1;
    return {
      target: target.parentElement,
      index: parentIndex,
      type: classifyEdge(target, parentIndex),
    };
  } else {
    // The cursor is in a non-text node. So we check out the next interesting child and step into it
    let nextChildElement = target.children[index];
    return {
      target: nextChildElement,
      index: 0,
      type: classifyEdge(nextChildElement, 0),
    };
  }
}

/**
 *
 * @param {HTMLElement} target
 * @param {number} index
 * @param {(target: HTMLElement, index: number) => {target: any, index: any, type: number}} getInDirection
 * @returns
 */
function move(target, index, getInDirection, silent = true) {
  let current = { target, index };

  // TODO: Handle the case where we navigate outside of the math element!

  while (true) {
    let potentialNext = getInDirection(current.target, current.index);
    if (!silent) console.log(current, "lead to", potentialNext);
    if (potentialNext.type == BoxEdge.New) {
      // Also includes the "next character in text"
      return potentialNext;
    } else if (potentialNext.type == BoxEdge.Skip) {
      current.target = potentialNext.target;
      current.index = potentialNext.index;
    } else if (potentialNext.type == BoxEdge.Ignore) {
      current.target = potentialNext.target;
      current.index = getChildrenLength(potentialNext.index); // skip over the children
    }
  }
}

function addCaretLocations(caretLocations, mathElement) {
  /**
   *
   * @param {HTMLElement} element
   * @param  {...String} tagNames
   */
  function tagIs(element, ...tagNames) {
    return tagNames.includes(element.tagName.toLowerCase());
  }

  // TODO: What if we have an empty element? Should we add a caret to every empty element?
  // TODO: How should mtext be handled?
  // TODO: How should mpadded be handled?
  // TODO: https://github.com/w3c/mathml-core/issues/111
  // TODO: Move around in text

  /**
   * Finds the previous actually visible sibling, so it skips over mphantoms
   * @param {HTMLElement} element
   */
  function previousVisibleSibling(element) {
    let sibling = element.previousElementSibling;
    while (
      sibling &&
      tagIs(
        sibling,
        "annotation",
        "annotation-xml",
        "mphantom",
        "none",
        "mprescripts"
      )
    ) {
      sibling = element.previousElementSibling;
    }
    return sibling;
  }

  /**
   * Decides whether an element should get a starting caret or not.
   * For example, if we have two elements next to each other in an mrow,
   * then we can safely skip the starting caret for the second one.
   * @param {HTMLElement} element
   */
  function shouldHaveStartingCaret(element) {
    let parent = element.parentElement;
    if (tagIs(parent, "math")) {
      if (previousVisibleSibling(element) != null) {
        return false;
      } else {
        return true;
      }
      // TODO: Apparently also include "msqrt" into this list
    } else if (tagIs(parent, "mrow", "msup", "msub", "msubsup")) {
      if (previousVisibleSibling(element) != null) {
        return false;
      } else {
        // We aren't sure if there is a sibling to our right
        // For example, we could be in a nested mrow
        // So we ask the parent
        return shouldHaveStartingCaret(parent);
      }
    } else {
      return true;
    }
  }

  /**
   *
   * @param {HTMLElement} element
   */
  function addCaretLocation(element) {
    if (!element) return;

    let children = [...element.children];
    if (tagIs(element, "mi", "mn", "mo", "mspace", "ms")) {
      let { x, y, width, height } = getElementBounds(element);
      if (shouldHaveStartingCaret(element)) {
        caretLocations.push(new CaretLocation(x, y, height));
      }
      children.forEach((v) => addCaretLocation(v)); // TODO: Maybe not needed for those elements?
      caretLocations.push(new CaretLocation(x + width, y, height));
    } else if (
      tagIs(
        element,
        "mfrac",
        "msqrt",
        "munder",
        "mover",
        "munderover",
        "mmultiscripts"
      )
    ) {
      let { x, y, width, height } = getElementBounds(element);
      if (shouldHaveStartingCaret(element)) {
        caretLocations.push(new CaretLocation(x, y, height));
      }
      children.forEach((v) => addCaretLocation(v));
      caretLocations.push(new CaretLocation(x + width, y, height));
    } else if (
      tagIs(
        element,
        "math",
        "mrow",
        "mroot",
        "mstyle",
        "merror",
        "maction",
        "mtable",
        "mtr",
        "mtd"
      )
    ) {
      children.forEach((v) => addCaretLocation(v));
    } else if (
      tagIs(
        element,
        "annotation",
        "annotation-xml",
        "mphantom",
        "none",
        "mprescripts"
      )
    ) {
      // Ignore
    } else if (tagIs(element, "semantics")) {
      // Semantics annotates exactly one child
      addCaretLocation(children[0]);
    } else if (tagIs(element, "mtext", "mpadded")) {
      throw new Error("TODO: Not implemented");
    }
    // TODO:
    else if (tagIs(element, "msub", "msup", "msubsup")) {
      let { x, y, width, height } = getElementBounds(element);
      // No starting caret, instead the first child will have one

      children.forEach((v) => addCaretLocation(v));
      caretLocations.push(new CaretLocation(x + width, y, height));
    } else {
      console.warn("Unknown element", element);
    }
  }

  addCaretLocation(mathElement);
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

  // A cursor here consists of an index in the caretLocations array
  // The index can be the index in the text, or it can be 0 (start) or 1 (end)
  let cursor = {
    cursorElement,
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
