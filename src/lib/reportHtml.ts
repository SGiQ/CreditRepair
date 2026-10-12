/**
 * Trims a saved web page down to its content before it is stored and sent for analysis: scripts, stylesheets,
 * templates and comments carry no report data, and on a monitoring site's page they outweigh it many times over.
 * Tags and table structure are kept so the three bureau columns still line up.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template|svg|iframe|canvas|video|audio)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(link|meta|base)\b[^>]*>/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}
