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

/**
 * Makes `nodes` the children of `parent`, like replaceChildren, but leaves
 * in place those already there: a playing <video> taken out and put back,
 * like the Mirror's, can come back drawn at the wrong size on iPhone.
 */
export function replaceScreen(parent: Node, nodes: readonly Node[]): void {
  const kept = new Set(nodes);
  for (const child of Array.from(parent.childNodes)) {
    if (!kept.has(child)) child.remove();
  }
  let next = parent.firstChild;
  for (const node of nodes) {
    if (node === next) next = next.nextSibling;
    else parent.insertBefore(node, next);
  }
}

const status = document.querySelector<HTMLElement>("#status");

export function showStatus(text: string): void {
  if (status) status.textContent = text;
}
