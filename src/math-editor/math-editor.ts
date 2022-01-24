import { assert, assertUnreachable } from "../assert";
import { MathAst } from "./math-ast";
import { MathIR, MathIRContainer, MathIRLayout, MathIRRow, MathIRSymbolLeaf, MathIRTextLeaf } from "./math-ir";
import { fromElement as fromMathMLElement, toElement as toMathMLElement } from "./mathml-utils";
import arrayUtils from "./array-utils";

interface MathmlCaret {
  setPosition(x: number, y: number): void;
  setHeight(v: number): void;
  destroy(): void;
}

interface MathmlInputHandler {
  inputElement: HTMLElement;
  destroy(): void;
}

function createCaret(documentBody: HTMLElement): MathmlCaret {
  const caretElement = document.createElement("span");
  caretElement.style.userSelect = "none";
  caretElement.style.position = "absolute";
  caretElement.style.height = "10px";
  caretElement.style.width = "0px";
  caretElement.style.margin = "0px";
  caretElement.style.borderRightWidth = "0px";
  caretElement.style.boxShadow = "0px 0px 0px 0.6px rgba(50, 50, 230, 50%)";
  caretElement.style.top = "0px";
  // Maybe add some cute blinking
  caretElement.className = "math-cursor";
  documentBody.appendChild(caretElement);

  function setPosition(x: number, y: number) {
    caretElement.style.left = `${x}px`;
    caretElement.style.top = `${y}px`;
  }

  function setHeight(v: number) {
    caretElement.style.height = `${v}px`;
  }

  function destroy() {
    documentBody.removeChild(caretElement);
  }

  return {
    setPosition,
    setHeight,
    destroy,
  };
}

function createInputHandler(documentBody: HTMLElement): MathmlInputHandler {
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
  documentBody.appendChild(inputElement);

  function destroy() {
    documentBody.removeChild(inputElement);
  }

  return {
    inputElement,
    destroy,
  };
}

function getAdjacentChild(parent: MathIRRow, element: MathIR, direction: number): (MathIRTextLeaf | MathIRContainer | MathIRSymbolLeaf) | null;
function getAdjacentChild(parent: MathIRContainer, element: MathIR, direction: number): MathIRRow | null;
function getAdjacentChild(parent: MathIRRow | MathIRContainer, element: MathIR, direction: number): MathIR | null {
  assert(direction != 0);
  if (parent.type == "row") {
    if (element.type != "row") {
      const indexInParent = parent.values.indexOf(element);
      assert(indexInParent != -1);
      return indexInParent + direction >= parent.values.length || indexInParent + direction < 0 ? null : parent.values[indexInParent + direction];
    } else {
      return null;
    }
  } else if (parent.type == "table") {
    if (element.type == "row") {
      // We assume that tables are always rectangular
      const length = parent.values.length;
      const width = parent.values[0].length;
      for (let i = 0; i < length; i++) {
        const indexInParent = parent.values[i].indexOf(element);
        if (indexInParent == -1) continue;

        const oneDimensionalIndex = i * width + indexInParent;
        const adjacentIndex = oneDimensionalIndex + direction;
        return adjacentIndex >= length * width || adjacentIndex < 0 ? null : parent.values[Math.trunc(adjacentIndex / width)][adjacentIndex % width];
      }
      // Unreachable
      throw new Error("Element not found in table");
    } else {
      return null;
    }
  } else {
    if (element.type == "row") {
      const indexInParent = parent.values.indexOf(element);
      assert(indexInParent != -1);
      return indexInParent + direction >= parent.values.length || indexInParent + direction < 0 ? null : parent.values[indexInParent + direction];
    } else {
      return null;
    }
  }
}

export interface MathCaret {
  row: MathIRRow | MathIRTextLeaf;
  offset: number;
  caretElement: MathmlCaret;
}

export class MathEditor {
  carets: Set<MathCaret> = new Set<MathCaret>();
  mathAst: MathAst;
  render: () => void;
  lastLayout: MathIRLayout | null = null;
  inputHandler: MathmlInputHandler;

  constructor(element: HTMLElement) {
    element.style.userSelect = "none";
    element.style.display = "block";
    element.style.fontFamily = "STIX Two";
    element.tabIndex = 0;

    this.mathAst = MathAst(fromMathMLElement(element));
    console.log(this.mathAst);

    this.carets.add({
      row: this.mathAst.mathIR,
      offset: 0,
      caretElement: createCaret(document.body),
    });

    this.inputHandler = createInputHandler(document.body);

    // https://d-toybox.com/studio/lib/input_event_viewer.html
    // https://w3c.github.io/uievents/tools/key-event-viewer.html
    // https://tkainrad.dev/posts/why-keyboard-shortcuts-dont-work-on-non-us-keyboard-layouts-and-how-to-fix-it/

    // For now, I'll just use the following for text input
    // - Sneaky textarea or input field
    // - beforeInput event
    //   - https://rawgit.com/w3c/input-events/v1/index.html#interface-InputEvent-Attributes

    // TODO: Fix the superscript/subscript caret rendering

    // Register keyboard handlers
    // TODO:
    // - up and down
    // - fractions by typing /
    // - space to move to the right (but only in some cases)
    // - Letters and numbers
    // - Shift+arrow keys to select
    // - Shortcuts system (import a lib)
    // - undo and redo

    // Register mouse handlers
    // - Click (put cursor)
    // - Drag (selection)

    // Multi-caret support
    // TODO:
    // - move carets to the same spot (merge)
    // - select and delete region that contains a caret
    element.addEventListener("focus", (ev) => {
      this.inputHandler.inputElement.focus();
    });

    this.inputHandler.inputElement.addEventListener("keydown", (ev) => {
      console.info(ev);
      if (ev.key == "ArrowUp") {
        this.carets.forEach((caret) => this.moveCaret(caret, "up"));
        this.renderCarets();
      } else if (ev.key == "ArrowDown") {
        this.carets.forEach((caret) => this.moveCaret(caret, "down"));
        this.renderCarets();
      } else if (ev.key == "ArrowLeft") {
        this.carets.forEach((caret) => this.moveCaret(caret, "left"));
        this.renderCarets();
      } else if (ev.key == "ArrowRight") {
        this.carets.forEach((caret) => this.moveCaret(caret, "right"));
        this.renderCarets();
      }
    });

    this.inputHandler.inputElement.addEventListener("beforeinput", (ev) => {
      console.info(ev);
      if (ev.inputType == "deleteContentBackward" || ev.inputType == "deleteWordBackward") {
        this.carets.forEach((caret) => this.deleteAtCaret(caret, "left"));
        this.render();
      } else if (ev.inputType == "deleteContentForward" || ev.inputType == "deleteWordForward") {
        this.carets.forEach((caret) => this.deleteAtCaret(caret, "right"));
        this.render();
      } else if (ev.inputType == "insertText") {
        const data = ev.data;
        if (data != null) {
          this.carets.forEach((caret) => this.insertAtCaret(caret, data));
        }
        this.render();
      }
    });

    window.addEventListener("resize", () => this.renderCarets());

    this.render = () => {
      // TODO: Render caret
      // - Highlight current element
      // - Highlight brackets

      const newMathElement = toMathMLElement(this.mathAst.mathIR);
      this.lastLayout = newMathElement.mathIRLayout;
      element.replaceChildren(...newMathElement.element.children);
      // Don't copy the attributes

      this.renderCarets();
    };

    this.render();
  }

  renderCarets() {
    this.carets.forEach((v) => this.renderCaret(v));
  }

  renderCaret(caret: MathCaret) {
    const lastLayout = this.lastLayout;
    if (!lastLayout) return;

    const layoutGetter = lastLayout.get(caret.row);
    assert(layoutGetter !== undefined);
    const layout = layoutGetter(caret.offset);
    caret.caretElement.setPosition(layout.x, layout.y);
    caret.caretElement.setHeight(layout.height);
  }

  removeCaret(caret: MathCaret) {
    caret.caretElement.destroy();
    this.carets.delete(caret);
  }

  /**
   * Note: Make sure to re-render the caret after moving it
   */
  moveCaret(caret: MathCaret, direction: "up" | "down" | "left" | "right") {
    const mathAst = this.mathAst;

    function moveCaretInDirection(caretElement: MathIR, direction: "left" | "right"): boolean {
      const isLeft = direction == "left";
      const parent = mathAst.parents.get(caretElement);
      if (!parent) return false;

      if (parent.type == "row") {
        const offset = (parent.values as MathIR[]).indexOf(caretElement);
        assert(offset != -1);
        caret.row = parent;
        caret.offset = offset + (isLeft ? 0 : 1);
        return true;
      } else {
        const adjacentChild = getAdjacentChild(parent, caretElement, isLeft ? -1 : 1);
        if (adjacentChild != null) {
          caret.row = adjacentChild;
          caret.offset = isLeft ? adjacentChild.values.length : 0;
          return true;
        } else {
          // We're at the end, move up
          return moveCaretInDirection(parent, direction);
        }
      }
    }

    function moveCaretRightDown(adjacentChild: MathIRTextLeaf | MathIRContainer | MathIRSymbolLeaf): boolean {
      if (adjacentChild.type == "text" || adjacentChild.type == "error") {
        caret.row = adjacentChild;
        caret.offset = 0;
        return true;
      } else if (adjacentChild.type == "bracket" || adjacentChild.type == "symbol") {
        return false;
      } else if (adjacentChild.type == "table") {
        caret.row = adjacentChild.values[0][0];
        caret.offset = 0;
        return true;
      } else {
        caret.row = adjacentChild.values[0];
        caret.offset = 0;
        return true;
      }
    }

    function moveCaretLeftDown(adjacentChild: MathIRTextLeaf | MathIRContainer | MathIRSymbolLeaf): boolean {
      if (adjacentChild.type == "text" || adjacentChild.type == "error") {
        caret.row = adjacentChild;
        caret.offset = adjacentChild.value.length;
        return true;
      } else if (adjacentChild.type == "bracket" || adjacentChild.type == "symbol") {
        return false;
      } else if (adjacentChild.type == "table") {
        const lastTableRow = adjacentChild.values[adjacentChild.values.length - 1];
        caret.row = lastTableRow[lastTableRow.length - 1];
        caret.offset = 0;
        return true;
      } else {
        const row = adjacentChild.values[adjacentChild.values.length - 1];
        caret.row = row;
        caret.offset = row.values.length;
        return true;
      }
    }

    function moveCaretInVerticalDirection(caretElement: MathIRRow | MathIRTextLeaf, direction: "up" | "down"): boolean {
      // TODO: Potentially tweak this so that it attempts to keep the x-coordinate
      const { parent, indexInParent } = mathAst.getParentAndIndex(caretElement);
      if (!parent) return false;

      if (parent.type == "table") {
        // TODO:
        return false;
      } else if (parent.type == "frac" || parent.type == "root" || parent.type == "under" || parent.type == "over") {
        if (caretElement.type == "row") {
          const newIndexInParent = indexInParent + (direction == "up" ? -1 : 1);

          if (newIndexInParent < 0 || newIndexInParent >= parent.values.length) {
            // Reached the top/bottom
            const parentParent = mathAst.getParent(parent);
            return parentParent == null ? false : moveCaretInVerticalDirection(parentParent, direction);
          } else {
            // Can move up or down
            const row = parent.values[newIndexInParent];
            caret.row = parent.values[newIndexInParent];
            caret.offset = direction == "up" ? row.values.length : 0;
            return true;
          }
        } else {
          return false;
        }
      } else if (parent.type == "sup" || parent.type == "sub") {
        // TODO:
        return false;
      } else {
        return moveCaretInVerticalDirection(parent, direction);
      }
    }

    if (direction == "right") {
      if (this.isCaretAtEdge(caret, direction)) {
        moveCaretInDirection(caret.row, direction);
      } else {
        if (caret.row.type == "row") {
          const movedIntoTree = moveCaretRightDown(caret.row.values[caret.offset]);
          if (!movedIntoTree) {
            caret.offset += 1;
          }
        } else {
          caret.offset += 1;
        }
      }
    } else if (direction == "left") {
      if (this.isCaretAtEdge(caret, direction)) {
        moveCaretInDirection(caret.row, direction);
      } else {
        if (caret.row.type == "row") {
          const movedIntoTree = moveCaretLeftDown(caret.row.values[caret.offset - 1]);
          if (!movedIntoTree) {
            caret.offset -= 1;
          }
        } else {
          caret.offset -= 1;
        }
      }
    } else if (direction == "up") {
      moveCaretInVerticalDirection(caret.row, direction);
    } else if (direction == "down") {
      moveCaretInVerticalDirection(caret.row, direction);
    } else {
      assertUnreachable(direction);
    }
  }

  /**
   * Checks if the caret is moving at the very edge of its container
   */
  isCaretAtEdge(caret: MathCaret, direction: "left" | "right"): boolean {
    if (direction == "right") {
      if (caret.row.type == "row") {
        return caret.offset >= caret.row.values.length;
      } else {
        return caret.offset >= caret.row.value.length;
      }
    } else {
      return caret.offset <= 0;
    }
  }

  /**
   * Gets the element that the caret is "touching"
   */
  getElementAtCaret(caret: MathCaret, direction: "left" | "right"): MathIRTextLeaf | MathIRContainer | MathIRSymbolLeaf | null {
    if (caret.row.type == "row") {
      const elementIndex = caret.offset + (direction == "left" ? -1 : 0);
      return arrayUtils.get(caret.row.values, elementIndex) ?? null;
    } else {
      return null;
    }
  }

  /**
   * Note: Make sure to re-render after deleting
   */
  deleteAtCaret(caret: MathCaret, direction: "left" | "right") {
    function removeButKeepChildren(
      mathAst: MathAst,
      toRemove: MathIRContainer,
      children: (MathIRContainer | MathIRSymbolLeaf | MathIRTextLeaf)[]
    ): { parent: MathIRRow; indexInParent: number } {
      const { parent, indexInParent } = mathAst.getParentAndIndex(toRemove);
      assert(parent != null);
      for (let i = 0; i < children.length; i++) {
        mathAst.insertChild(parent, children[i], indexInParent + i);
      }
      mathAst.removeChild(parent, toRemove);
      return { parent, indexInParent };
    }

    if (caret.row.type == "row") {
      // Row deletion
      const elementAtCaret = this.getElementAtCaret(caret, direction);
      if (elementAtCaret == null) {
        // At the start or end of a row
        const { parent, indexInParent } = this.mathAst.getParentAndIndex(caret.row);
        if (parent == null) return;
        if (parent.type == "frac") {
          if ((indexInParent == 0 && direction == "left") || (indexInParent == 1 && direction == "right")) {
            this.moveCaret(caret, direction);
          } else {
            // Delete the fraction but keep its contents
            const parentContents = parent.values.flatMap((v) => v.values);
            const { parent: parentParent, indexInParent: indexInParentParent } = removeButKeepChildren(this.mathAst, parent, parentContents);

            caret.row = parentParent;
            caret.offset = indexInParentParent + parent.values[0].values.length;
          }
        } else if ((parent.type == "sup" || parent.type == "sub") && direction == "left") {
          // Delete the superscript/subscript but keep its contents
          const parentContents = parent.values.flatMap((v) => v.values);
          const { parent: parentParent, indexInParent: indexInParentParent } = removeButKeepChildren(this.mathAst, parent, parentContents);

          caret.row = parentParent;
          caret.offset = indexInParentParent;
        } else if (parent.type == "root") {
          if ((indexInParent == 0 && direction == "right") || (indexInParent == 1 && direction == "left")) {
            // Delete root but keep its contents
            const parentContents = parent.values[1].values;
            const { parent: parentParent, indexInParent: indexInParentParent } = removeButKeepChildren(this.mathAst, parent, parentContents);

            caret.row = parentParent;
            caret.offset = indexInParentParent;
          } else {
            this.moveCaret(caret, direction);
          }
        } else {
          this.moveCaret(caret, direction);
        }
      } else if (elementAtCaret.type == "symbol" || elementAtCaret.type == "bracket") {
        this.mathAst.removeChild(caret.row, elementAtCaret);
        if (direction == "left") {
          caret.offset -= 1;
        }
      } else if ((elementAtCaret.type == "sup" || elementAtCaret.type == "sub") && direction == "right") {
        // Delete the superscript/subscript but keep its contents
        const parentContents = elementAtCaret.values.flatMap((v) => v.values);
        const { parent: parentParent, indexInParent: indexInParentParent } = removeButKeepChildren(this.mathAst, elementAtCaret, parentContents);

        caret.row = parentParent;
        caret.offset = indexInParentParent;
      } else {
        this.moveCaret(caret, direction);
      }
    } else {
      // Text deletion
      if ((direction == "left" && caret.offset <= 0) || (direction == "right" && caret.offset >= caret.row.value.length)) {
        this.moveCaret(caret, direction);
      } else {
        if (direction == "left") {
          caret.row.value = caret.row.value.slice(0, caret.offset - 1) + caret.row.value.slice(caret.offset);
          caret.offset -= 1;
        } else {
          caret.row.value = caret.row.value.slice(0, caret.offset) + caret.row.value.slice(caret.offset + 1);
        }
      }
    }
  }

  /**
   * User typed some text
   */
  insertAtCaret(caret: MathCaret, text: string) {
    if (caret.row.type == "row") {
      if (text == "^") {
        const mathIR: MathIR = {
          type: "sup",
          values: [
            {
              type: "row",
              values: [],
            },
          ],
        };
        this.mathAst.setParents(null, [mathIR]);
        this.mathAst.insertChild(caret.row, mathIR, caret.offset);
      } else if (text == "_") {
        const mathIR: MathIR = {
          type: "sub",
          values: [
            {
              type: "row",
              values: [],
            },
          ],
        };
        this.mathAst.setParents(null, [mathIR]);
        this.mathAst.insertChild(caret.row, mathIR, caret.offset);
      }
    } else {
      caret.row.value = caret.row.value.slice(0, caret.offset) + text + caret.row.value.slice(caret.offset);
      caret.offset += text.length;
    }
  }

  destroy() {
    [...this.carets].forEach((v) => this.removeCaret(v));
    this.render = () => {};
    this.lastLayout = null;
    this.inputHandler.destroy();
  }
}
