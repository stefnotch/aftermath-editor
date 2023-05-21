type InverseAction<T> = T;

export class UndoRedoManager<Action> {
  /**
   * Undo-stack, with normal actions.
   * Have to be inverted before they can be applied.
   */
  private undoStack: Action[] = [];

  /**
   * Redo-stack, with normal actions.
   * Can simply be applied.
   */
  private redoStack: Action[] = [];

  // TODO: Far future
  // Cap the size of the undo-stack
  // Store the entire state of the formula in a separate long-term undo stack every once in a while/every x actions/every x seconds
  // That lets one undo all the way back to the initial state without having a huge undo-stack

  private invert: (action: Action) => Action;

  constructor(invert: (action: Action) => InverseAction<Action>) {
    this.invert = invert;
  }

  /**
   * Push a redo-action to the undo-stack and clear the redo-stack.
   */
  public push(action: Action) {
    this.undoStack.push(action);
    this.redoStack = [];
  }

  /**
   * Get an undo-action
   */
  public undo(): InverseAction<Action> | null {
    const action = this.undoStack.pop() ?? null;
    if (action === null) return null;

    this.redoStack.push(action);
    return this.invert(action);
  }

  public redo(): Action | null {
    const action = this.redoStack.pop() ?? null;
    if (action === null) return null;

    this.undoStack.push(action);
    return action;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
