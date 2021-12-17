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

// TODO: Write documentation about the algorithm
/**
 * A parent defines where you can place the cursor for its direct children.
 */
const BoxEdge = {
  /**
   * You can definitely place the cursor at this edge.
   */
  New: 0,
  /**
   * You cannot place the cursor here, however you might be able to place it inside one of the deeper children.
   */
  Skip: 2,
  /**
   * You cannot place the cursor here or anywhere deeper in this tree.
   */
  Ignore: 3,
};

const tagBoxHandling = new Map([
  ["math", (element, index) => BoxEdge.New],
  ["semantics", (element, index) => BoxEdge.Skip], // Semantics annotates exactly one child
  ["annotation", (element, index) => BoxEdge.Ignore],
  ["annotation-xml", (element, index) => BoxEdge.Ignore],
  [
    "mtext",
    (element, index) => {
      if (index == 0) return BoxEdge.Skip;
      if (index == getChildrenLength(element)) return BoxEdge.Skip;
      return BoxEdge.New;
    },
  ], // Maybe mtext deserves BoxEdge.New
  [
    "mi",
    (element, index) => {
      if (index == 0) return BoxEdge.Skip;
      if (index == getChildrenLength(element)) return BoxEdge.Skip;
      return BoxEdge.New;
    },
  ],
  [
    "mn",
    (element, index) => {
      if (index == 0) return BoxEdge.Skip;
      if (index == getChildrenLength(element)) return BoxEdge.Skip;
      return BoxEdge.New;
    },
  ],
  [
    "mo",
    (element, index) => {
      if (index == 0) return BoxEdge.Skip;
      if (index == getChildrenLength(element)) return BoxEdge.Skip;
      return BoxEdge.New;
    },
  ],
  [
    "mspace",
    (element, index) => {
      if (index == 0) return BoxEdge.Skip;
      if (index == getChildrenLength(element)) return BoxEdge.Skip;
      return BoxEdge.New;
    },
  ],
  [
    "ms",
    (element, index) => {
      if (index == 0) return BoxEdge.Skip;
      if (index == getChildrenLength(element)) return BoxEdge.Skip;
      return BoxEdge.New;
    },
  ],
  [
    "mrow",
    (element, index) => {
      if (index == 0) return BoxEdge.Skip;
      if (index == getChildrenLength(element)) return BoxEdge.Skip;
      return BoxEdge.New;
    },
  ], // Skip, new, new, new, ....., skip
  ["mfrac", (element, index) => BoxEdge.New],
  ["msqrt", (element, index) => BoxEdge.New],
  ["mroot", (element, index) => (index <= 1 ? BoxEdge.Skip : BoxEdge.New)], // skip edges for the first child element
  ["mstyle", (element, index) => BoxEdge.Skip],
  ["merror", (element, index) => BoxEdge.Skip], // Maybe merror deserves BoxHandling.New. or mtext?
  ["maction", (element, index) => BoxEdge.Skip],
  ["mpadded", (element, index) => BoxEdge.New],
  ["mphantom", (element, index) => BoxEdge.Ignore],
  ["msub", (element, index) => (index <= 0 ? BoxEdge.Skip : BoxEdge.New)],
  ["msup", (element, index) => (index <= 0 ? BoxEdge.Skip : BoxEdge.New)],
  ["msubsup", (element, index) => (index <= 0 ? BoxEdge.Skip : BoxEdge.New)],
  ["munder", (element, index) => BoxEdge.New],
  ["mover", (element, index) => BoxEdge.New],
  ["munderover", (element, index) => BoxEdge.New], // because it matters which elements are sandwiched between the under-over
  // see https://www.w3.org/TR/mathml-core/#prescripts-and-tensor-indices-mmultiscripts
  ["mmultiscripts", (element, index) => BoxEdge.New],
  ["none", (element, index) => BoxEdge.Ignore], // Or we could make all "none"s navigateable. Hm
  ["mprescripts", (element, index) => BoxEdge.Ignore],
  ["mtable", (element, index) => BoxEdge.Skip],
  ["mtr", (element, index) => BoxEdge.Skip],
  ["mtd", (element, index) => BoxEdge.New],
]);

/**
 * MathML can be separated into text-containing nodes and other nodes.
 * When editing the mathematical part, we almost exclusively care about the text containing nodes
 * The other nodes are useful for navigating and for figuring out the structure.
 */
const textTagNames = ["mtext", "mi", "mn", "mo", "mspace", "ms"];

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

function classifyEdge(target, index) {
  let tagName = target.tagName.toLowerCase();
  let handling = tagBoxHandling.get(tagName);
  if (!handling) {
    console.warn("Unknown target", target);
    handling = (element, index) => BoxEdge.New;
  }

  return handling(target, index);
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

// TODO: A render-caret locations method
function addCaretLocations(caretLocations, mathElement) {
  function tagIs(element, ...tagNames) {
    return tagNames.includes(element.tagName.toLowerCase());
  }

  // Quick n cheap way of saying "skip the next opening thingy"
  let skipNext = false;

  /**
   *
   * @param {HTMLElement} element
   */
  function addCaretLocation(element) {
    if (!element) return;

    let children = [...element.children];

    if (tagIs(element, "math")) {
      skipNext = false;
      children.forEach((v) => addCaretLocation(v));
      skipNext = false;
    } else if (tagIs(element, "semantics")) {
      // Semantics annotates exactly one child
      addCaretLocation(children[0]);
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
    } else if (tagIs(element, "mtext", "mpadded")) {
      // Add a start and end caret
      let bounds = getElementBounds(element);
      caretLocations.push(new CaretLocation(bounds.x, bounds.y, bounds.height));
      skipNext = false;
      children.forEach((v) => addCaretLocation(v));
      caretLocations.push(
        new CaretLocation(bounds.x + bounds.width, bounds.y, bounds.height)
      );
      skipNext = false;
    } else if (tagIs(element, "mi", "mn", "mo", "mspace", "ms")) {
      // Hmm, only some of them produce a valid caret location
      // We could theoretically take a look at the stack. Or do this:

      // The "Check if no right sibling" rule has the problem that it needs to apply
      // to more elements, like fraction fraction or sqrt sqrt

      let bounds = getElementBounds(element);
      if (!skipNext) {
        caretLocations.push(
          new CaretLocation(bounds.x, bounds.y, bounds.height)
        );
        // skipNext = true; // TODO: ?
      }
      children.forEach((v) => addCaretLocation(v));

      caretLocations.push(
        new CaretLocation(bounds.x + bounds.width, bounds.y, bounds.height)
      );
      skipNext = true;
    } else if (tagIs(element, "mrow")) {
      // TODO: What if we have an empty mrow? Should we add a caret to every empty element?
      children.forEach((v) => addCaretLocation(v));
    } else if (tagIs(element, "mfrac")) {
      let bounds = getElementBounds(element);
      if (!skipNext) {
        caretLocations.push(
          new CaretLocation(bounds.x, bounds.y, bounds.height)
        );
      }

      children.forEach((v) => {
        skipNext = false;
        addCaretLocation(v);
      });

      caretLocations.push(
        new CaretLocation(bounds.x + bounds.width, bounds.y, bounds.height)
      );
      skipNext = true;
    } else if (tagIs(element, "msqrt")) {
      // The msqrt caret is a funky one. We place it *outside* of the element

      let bounds = getElementBounds(element);
      if (!skipNext) {
        caretLocations.push(
          new CaretLocation(bounds.x, bounds.y, bounds.height)
        );
      }
      skipNext = false;
      // TODO: A msqrt without any children has the same problem as an empty mrow...
      children.forEach((v) => addCaretLocation(v));

      caretLocations.push(
        new CaretLocation(bounds.x + bounds.width, bounds.y, bounds.height)
      );
      skipNext = true;
    } else if (tagIs(element, "mroot")) {
      // mroot has one msqrt and a "nth root" symbol
      children.forEach((v) => {
        addCaretLocation(v);
        skipNext = false;
      });
      skipNext = false;
    } else if (tagIs(element, "mstyle", "merror", "maction")) {
      children.forEach((v) => addCaretLocation(v));
    } else if (tagIs(element, "msub", "msup", "msubsup")) {
      let bounds = getElementBounds(element);

      children.forEach((v) => {
        addCaretLocation(v);
        skipNext = false;
      });

      caretLocations.push(
        new CaretLocation(bounds.x + bounds.width, bounds.y, bounds.height)
      );
      skipNext = true;
    } else if (
      tagIs(element, "munder", "mover", "munderover", "mmultiscripts")
    ) {
      // it matters which elements are sandwiched between the under-over
      // see also https://www.w3.org/TR/mathml-core/#prescripts-and-tensor-indices-mmultiscripts
      let bounds = getElementBounds(element);

      if (!skipNext) {
        caretLocations.push(
          new CaretLocation(bounds.x, bounds.y, bounds.height)
        );
      }
      // Normal carets outside, and every child gets its own caret positions
      children.forEach((v) => {
        skipNext = false;
        addCaretLocation(v);
      });

      caretLocations.push(
        new CaretLocation(bounds.x + bounds.width, bounds.y, bounds.height)
      );
      skipNext = true;
    } else if (tagIs(element, "mtable")) {
      // TODO: Finish it up, mtr and mtd also exist
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
