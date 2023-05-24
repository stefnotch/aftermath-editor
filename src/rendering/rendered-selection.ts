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

  join(current: RenderedSelection): RenderedSelection {
    assert(Math.abs(this.baseline - current.baseline) < 5, "Can't join selections with different baselines");
    return new RenderedSelection(ViewportMath.joinRectangles(this.rect, current.rect), this.baseline);
  }
}
