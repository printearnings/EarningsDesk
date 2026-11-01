import type { ReactNode } from "react";

/**
 * A schema.org JSON-LD block, rendered into the static HTML for search
 * engines. It's a data block the browser never executes, so the strict CSP
 * in public/_headers doesn't apply to it. `<` is escaped so a string in the
 * data can't close the script tag early.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/**
 * Plain text of a JSX fragment (strings, arrays, and elements' children), for
 * structured data built from copy that's written as markup, like the FAQ's
 * answers with inline links.
 */
export function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (typeof node === "object" && "props" in node) {
    return nodeText((node.props as { children?: ReactNode }).children);
  }
  return "";
}
