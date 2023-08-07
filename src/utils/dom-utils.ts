export function htmlToElement(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.firstElementChild;
}

export type CreateNodeOptions<Element> = Omit<Partial<Element>, "style"> & {
  style?: Partial<CSSStyleDeclaration>;
};

export function createNode<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  opts: CreateNodeOptions<HTMLElementTagNameMap[K]>,
  children: (string | Node)[] = []
) {
  const node = document.createElement(tagName);
  Object.entries(opts).forEach(([name, value]) => {
    if (name === "style") {
      Object.entries(value as any).forEach(([name, value]) => {
        (node.style as any)[name] = value;
      });
    } else {
      (node as any)[name] = value;
    }
  });
  node.append(...children);
  return node;
}
