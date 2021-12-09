[...document.querySelectorAll("math")].forEach(makeEditable);

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
   * You can place the cursor here, but other shared edges will get "collapsed" into it. Or skipped.
   */
  Shared: 1,
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
  ["math", [BoxEdge.New, BoxEdge.New]],
  ["semantics", [BoxEdge.Skip, BoxEdge.Skip]],
  ["annotation", [BoxEdge.Ignore, BoxEdge.Ignore]],
  ["annotation-xml", [BoxEdge.Ignore, BoxEdge.Ignore]],
  ["mtext", [BoxEdge.Shared, BoxEdge.Shared]], // Maybe mtext deserves BoxHandling.New
  ["mi", [BoxEdge.Shared, BoxEdge.Shared]],
  ["mn", [BoxEdge.Shared, BoxEdge.Shared]],
  ["mo", [BoxEdge.Shared, BoxEdge.Shared]],
  ["mspace", [BoxEdge.Shared, BoxEdge.Shared]],
  ["ms", [BoxEdge.Shared, BoxEdge.Shared]],
  ["mrow", [BoxEdge.Shared, BoxEdge.Shared]],
  ["mfrac", [BoxEdge.New, BoxEdge.New], [BoxEdge.New, BoxEdge.New]],
  ["msqrt", [BoxEdge.New, BoxEdge.New]],
  ["mroot", [BoxEdge.Shared, BoxEdge.Shared], [BoxEdge.New, BoxEdge.New]],
  ["mstyle", [BoxEdge.Skip, BoxEdge.Skip]],
  ["merror", [BoxEdge.Skip, BoxEdge.Skip]], // Maybe merror deserves BoxHandling.New
  ["maction", [BoxEdge.Skip, BoxEdge.Skip]],
  ["mpadded", [BoxEdge.New, BoxEdge.New]],
  ["mphantom", [BoxEdge.Ignore, BoxEdge.Ignore]],
  ["msub", [BoxEdge.Shared, BoxEdge.New], [BoxEdge.New, BoxEdge.New]],
  ["msup", [BoxEdge.Shared, BoxEdge.New], [BoxEdge.New, BoxEdge.New]],
  [
    "msubsup",
    [BoxEdge.Shared, BoxEdge.New],
    [BoxEdge.New, BoxEdge.New],
    [BoxEdge.New, BoxEdge.New],
  ],
  ["munder", [BoxEdge.Shared, BoxEdge.Shared], [BoxEdge.New, BoxEdge.New]],
  ["mover", [BoxEdge.Shared, BoxEdge.Shared], [BoxEdge.New, BoxEdge.New]],
  [
    "munderover",
    [BoxEdge.Shared, BoxEdge.Shared],
    [BoxEdge.New, BoxEdge.New],
    [BoxEdge.New, BoxEdge.New],
  ],
  // see https://www.w3.org/TR/mathml-core/#prescripts-and-tensor-indices-mmultiscripts
  [
    "mmultiscripts",
    [BoxEdge.Shared, BoxEdge.Shared],
    [BoxEdge.New, BoxEdge.New],
  ], // TODO: Here the boxes sorta depend on whether the postscripts and prescripts exist or not
  ["none", [BoxEdge.Ignore, BoxEdge.Ignore]], // Or we could make all "none"s navigateable. Hm
  ["mprescripts", [BoxEdge.Ignore, BoxEdge.Ignore]],
  ["mtable", [BoxEdge.Shared, BoxEdge.Shared]], // Not sure
  ["mtr", [BoxEdge.Shared, BoxEdge.Shared]], // Not sure
  ["mtd", [BoxEdge.New, BoxEdge.New]],
]);

// TODO: moveRight and moveLeft functions, using the info above

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
 * Creates a caret that can be positioned anywhere on the screen
 */
function createCaretElement() {
  let cursorElement = document.createElement("span");
  cursorElement.style.userSelect = "none";
  cursorElement.style.position = "absolute";
  cursorElement.style.height = "10px";
  cursorElement.style.width = "0px";
  cursorElement.style.margin = "0px";
  cursorElement.style.borderRightWidth = "0px";
  cursorElement.style.boxShadow = "0px 0px 0px 1px black";
  cursorElement.style.top = "0px";

  cursorElement.className = "math-cursor";
  document.body.appendChild(cursorElement);

  return cursorElement;
}

/**
 * Takes a <math> element and makes it editable
 * @param {HTMLElement} mathElement
 */
function makeEditable(mathElement) {
  mathElement.style.userSelect = "none";
  mathElement.tabindex = "0";

  makeHoverable(mathElement);

  // Some hack to overlay a caret
  let cursorElement = createCaretElement();

  // A cursor here consists of a text-containing node and an index
  let cursorTarget = null;
  let cursorIndex = 0;
  function setCursorTarget(t) {
    if (cursorTarget) {
    }
    cursorTarget = t;
    setCursorIndex(0);
    if (cursorTarget) {
    }
  }

  /**
   * Returns the number of characters in a text-containing node.
   * Could be cached
   */
  function getTextLength(t) {
    // TODO: A better implementation would use ranges: https://javascript.info/selection-range
    return t.innerText?.length ?? t.textContent.length;
  }

  /**
   * Returns the screen position of a letter in a text-containing node
   */
  function getLetterPosition(t, index) {
    // https://stackoverflow.com/a/51618540/3492994

    // A better implementation would deal with the fact that a node can contain multiple text childs
    let range = document.createRange();
    range.setStart(t.firstChild, index);

    return range.getBoundingClientRect();
  }

  /**
   * Sets the letter-index of the cursor. Also moves the caret there.
   */
  function setCursorIndex(index) {
    cursorIndex = index;
    if (cursorTarget) {
      let letterBoundingBox = getLetterPosition(cursorTarget, cursorIndex);
      let containerBoundingBox = cursorTarget.getBoundingClientRect();
      cursorElement.style.top = `${letterBoundingBox.top + window.scrollY}px`;
      cursorElement.style.left = `${letterBoundingBox.left + window.scrollX}px`;
      cursorElement.style.height = `${containerBoundingBox.height}px`;
    } else {
      cursorElement.style.top = "0px";
      cursorElement.style.left = "0px";
    }
  }

  function getAdjacent(t, direction) {
    if (direction == "Up" || direction == "Down") {
      // TODO: Special rules depending on t.parentNode
      return null;
    } else if (direction == "Left") {
      return getTextElement(t.previousElementSibling, "End");
    } else if (direction == "Right") {
      return getTextElement(t.nextElementSibling, "Start");
    }
  }

  /**
   * Gets a text element inside this node
   * @param {HTMLElement} t
   * @param {"Start"|"End"} startOrEnd the caller should decide which side to come from
   * @returns
   */
  function getTextElement(t, startOrEnd) {
    if (!t) return null;

    if (isTextTagElement(t)) {
      return t;
    }

    if (startOrEnd == "Start") {
      // Notice how we're using firstElementChild to skip #text nodes
      return getTextElement(t.firstElementChild, startOrEnd);
    } else if (startOrEnd == "End") {
      return getTextElement(t.lastElementChild, startOrEnd);
    }
  }

  function navigate(direction) {
    let currentElement = cursorTarget;
    let adjacentElement = null;
    while (currentElement && currentElement != mathElement) {
      adjacentElement = getAdjacent(currentElement, direction);
      if (adjacentElement) break;

      currentElement = currentElement.parentNode;
    }

    if (!currentElement || currentElement == mathElement) {
      console.log("no!");
      return;
    }

    if (adjacentElement == null) {
      console.log("absolutely not!");
      return;
    }

    setCursorTarget(adjacentElement);

    // TODO: This is still a bit of a hack
    if (direction == "Left") {
      setCursorIndex(getTextLength(adjacentElement));
    }
  }

  function skipFinalSpot(t) {
    // If placing the caret at the end of a text-element doesn't make sense, we skip it
    // So, we have the current element (t), an adjacent element (use the navigate algorithm) and a shared parent (...)

    // So we start from the current element and travel upwards. Certain elements, like msqrt mean that we automatiall "return false"
    // Otherwise, we end up at the shared parent. Now we *have* to decide
    // Whitelist or blacklist? Or depending on the style/relative positions?

    return false;
  }

  // If we click, we gotta do something
  mathElement.addEventListener("pointerdown", (ev) => {
    if (!isTextTagElement(ev.target)) {
      // TODO: Maybe select the nearest such element?
      return;
    }

    setCursorTarget(ev.target);

    let boundingBox = ev.target.getBoundingClientRect();

    // setCursorIndex according to the relative position in this element
    if (
      ev.pageX >=
      (boundingBox.left + boundingBox.right + +window.scrollX) / 2
    ) {
      setCursorIndex(getTextLength(ev.target));
    } else {
      setCursorIndex(0);
    }
  });

  // If we use the arrow keys, we gotta do something
  mathElement.addEventListener("keydown", (ev) => {
    if (!cursorTarget) return;

    if (ev.key == "ArrowUp") {
      navigate("Up");
    } else if (ev.key == "ArrowDown") {
      navigate("Down");
    } else if (ev.key == "ArrowLeft") {
      if (cursorIndex - 1 < 0) {
        navigate("Left");
      } else {
        setCursorIndex(cursorIndex - 1);
      }
    } else if (ev.key == "ArrowRight") {
      let maxLength = getTextLength(cursorTarget);
      if (cursorIndex + 1 > maxLength) {
        navigate("Right");
      } else if (cursorIndex + 1 == maxLength && skipFinalSpot(cursorTarget)) {
        // TODO: Don't make this a special case that's just here. Instead unconditionally check this after every move
        // Otherwise we could accidentally click on a "skip" final spot or something

        // Special case where we skip to the next node
        // For example, if we have <mn>2</mn><mo>=</mo>,
        //   we don't need to be able to put the cursor
        //       <mn>2HERE</mn><mo>=</mo>
        //   and <mn>2</mn><mo>HERE=</mo>
        navigate("Right");
      } else {
        setCursorIndex(cursorIndex + 1);
      }
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
    if (!isTextTagElement(ev.target)) {
      // TODO: Maybe select the nearest such element?
      return;
    }
    setHoverTarget(ev.target);
  });

  mathElement.addEventListener("pointerout", (ev) => {
    setHoverTarget(null);
  });
}
