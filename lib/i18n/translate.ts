/**
 * Shared dotted-path dictionary resolver, safe on server and client.
 * Supports {placeholder} interpolation. An unresolved path returns the
 * path itself, which is obvious in tests and screenshots instead of
 * silently rendering an empty string.
 */
export function translate(
  dict: unknown,
  path: string,
  params?: Record<string, string | number>,
): string {
  let node: unknown = dict;
  for (const key of path.split(".")) {
    if (node && typeof node === "object" && key in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  if (typeof node !== "string") return path;
  if (!params) return node;
  return node.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
