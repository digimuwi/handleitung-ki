// Baut aus entwurf.md eine eigenständige, gestaltete HTML-Seite (dist/index.html).
// entwurf.md bleibt die alleinige Quelle – diese Seite wird bei jedem Push neu erzeugt.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
}).use(footnote);

const source = await readFile(resolve(root, "entwurf.md"), "utf8");

// Titel und „Stand“ aus dem Markdown ziehen, dann aus dem Fließtext entfernen,
// weil beide gesondert im Seitenkopf gerendert werden.
const titleMatch = source.match(/^#\s+(.+)$/m);
const title = titleMatch ? titleMatch[1].trim() : "Handleitung: Generative KI";

const standMatch = source.match(/^\*\*Stand:\s*(.+?)\*\*$/m);
const stand = standMatch ? standMatch[1].trim() : null;

const body = source
  .replace(/^#\s+.+$/m, "")
  .replace(/^\*\*Stand:.+?\*\*$/m, "")
  .trim();

const contentHtml = md.render(body);

const template = await readFile(resolve(__dirname, "template.html"), "utf8");

const standHtml = stand
  ? `<p class="stand">Stand: ${escapeHtml(stand)}</p>`
  : "";

const html = template
  .replaceAll("{{TITLE}}", escapeHtml(title))
  .replace("{{STAND}}", standHtml)
  .replace("{{CONTENT}}", contentHtml);

await mkdir(resolve(root, "dist"), { recursive: true });
await writeFile(resolve(root, "dist/index.html"), html, "utf8");
await writeFile(resolve(root, "dist/.nojekyll"), "", "utf8");

console.log("dist/index.html erzeugt.");

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
