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
