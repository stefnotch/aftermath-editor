/**
 * https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
 * A value relative to the viewport.
 */
export type ViewportValue = number;

export type ViewportCoordinate = { x: ViewportValue; y: ViewportValue };

export type ViewportRect = {
  readonly x: ViewportValue;
  readonly y: ViewportValue;
  readonly width: ViewportValue;
  readonly height: ViewportValue;
};

export const ViewportMath = {
  /**
   * Minimum distance from a point to a rectangle. Returns 0 if the point is inside the rectangle.
   * Assumes the rectangle is axis-aligned.
   */
  distanceToRectangle: (bounds: ViewportRect, position: ViewportCoordinate) => {
    // https://stackoverflow.com/q/30545052/3492994

    const dx = Math.max(bounds.x - position.x, position.x - (bounds.x + bounds.width));
    const dy = Math.max(bounds.y - position.y, position.y - (bounds.y + bounds.height));

    return Math.sqrt(Math.max(0, dx) ** 2 + Math.max(0, dy) ** 2);
  },

  distanceToPoint: (a: ViewportCoordinate, b: ViewportCoordinate) => {
    return Math.hypot(b.x - a.x, b.y - a.y);
  },
  distanceToPointSquared: (a: ViewportCoordinate, b: ViewportCoordinate) => {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  },
  distanceToSegmentSquared: (position: ViewportCoordinate, segment: { a: ViewportCoordinate; b: ViewportCoordinate }) => {
    const { a, b } = segment;
    // https://stackoverflow.com/a/1501725/3492994
    const EPSILON = 0.00001;
    const segmentLength = ViewportMath.distanceToPointSquared(a, b);
    if (segmentLength < EPSILON) return ViewportMath.distanceToPointSquared(position, a);
    let t = ((position.x - a.x) * (b.x - a.x) + (position.y - a.y) * (b.y - a.y)) / segmentLength;
    t = Math.max(0, Math.min(1, t));
    return ViewportMath.distanceToPointSquared(position, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  },
  distanceToSegment: (position: ViewportCoordinate, segment: { a: ViewportCoordinate; b: ViewportCoordinate }) => {
    return Math.sqrt(ViewportMath.distanceToSegmentSquared(position, segment));
  },
};
