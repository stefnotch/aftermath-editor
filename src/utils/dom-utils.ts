/**
 * Checks if an element has a given tag name
 */
export function tagIs(element: Element, ...tagNames: string[]): boolean {
  return tagNames.includes(element.tagName.toLowerCase());
}
