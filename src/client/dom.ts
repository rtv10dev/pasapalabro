type Child = Node | string | null | false;

/** Creates an element with the given properties and children; null and false children are skipped. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  Object.assign(element, props);
  for (const child of children) {
    if (child !== null && child !== false) element.append(child);
  }
  return element;
}

const status = document.querySelector<HTMLElement>("#status");

export function showStatus(text: string): void {
  if (status) status.textContent = text;
}
