/**
 * The document as a tree of text, for asserting what a report actually says.
 *
 * The rendered PDF is not searchable: react-pdf subsets its fonts, so the
 * words in the file are glyph indices rather than letters. Rendering still
 * proves the layout works and how many pages it takes - that is done
 * separately - but it cannot answer "does the plate say P01".
 *
 * So this walks the element tree the components produce, calling each function
 * component to expand it, and collects the strings. It is the real components
 * with the real props, one step before the renderer.
 */

/** Every string in the tree, in document order. */
export function textOf(element, out = []) {
  if (element === null || element === undefined || element === false) return out;
  if (typeof element === "string") {
    if (element.trim()) out.push(element);
    return out;
  }
  if (typeof element === "number") {
    out.push(String(element));
    return out;
  }
  if (Array.isArray(element)) {
    for (const child of element) textOf(child, out);
    return out;
  }
  if (typeof element !== "object" || !("type" in element)) return out;

  const { type, props } = element;
  if (typeof type === "function") return textOf(type(props ?? {}), out);
  return textOf(props?.children, out);
}

/** The tree flattened to one string, for "does it mention" questions. */
export function textJoined(element) {
  return textOf(element).join("\n");
}

/** Every node of the expanded tree, so props can be inspected. */
export function nodesOf(element, out = []) {
  if (!element || typeof element !== "object") return out;
  if (Array.isArray(element)) {
    for (const child of element) nodesOf(child, out);
    return out;
  }
  if (!("type" in element)) return out;
  const { type, props } = element;
  if (typeof type === "function") return nodesOf(type(props ?? {}), out);
  out.push(element);
  return nodesOf(props?.children, out);
}
