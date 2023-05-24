import { assert } from "../utils/assert";
import { ViewportMath, ViewportRect, ViewportValue } from "./viewport-coordinate";

export class RenderedSelection {
  #rect: ViewportRect;
  #baseline: ViewportValue;

  constructor(rect: ViewportRect, baseline: ViewportValue) {
    this.#rect = rect;
    this.#baseline = baseline;
  }

  get rect(): ViewportRect {
    return this.#rect;
  }

  get baseline(): ViewportValue {
    return this.#baseline;
  }

  get isCollapsed(): boolean {
    return this.#rect.width === 0;
  }

  /**
   * Joins adjacent selections, but keeps selections that start a new line separate.
   */
  static joinAdjacent(values: RenderedSelection[]): RenderedSelection[] {
    if (values.length === 0) return [];

    let result: RenderedSelection[] = [values[0]];
    for (let i = 1; i < values.length; i++) {
      const last = result[result.length - 1];
      const current = values[i];
      const lastEnd = last.rect.x + last.rect.width;
      const currentStart = current.rect.x;
      // Since the bounding boxes aren't always very precise, we allow for some wiggle room
      if (lastEnd <= currentStart && Math.abs(lastEnd - currentStart) < 10) {
        result[result.length - 1] = last.join(current);
      }
    }
    return result;
  }

  join(current: RenderedSelection): RenderedSelection {
    assert(Math.abs(this.baseline - current.baseline) < 5, "Can't join selections with different baselines");
    return new RenderedSelection(ViewportMath.joinRectangles(this.rect, current.rect), this.baseline);
  }
}
