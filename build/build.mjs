// Baut aus entwurf.md eine eigenständige, gestaltete HTML-Seite (dist/index.html).
// entwurf.md bleibt die alleinige Quelle – diese Seite wird bei jedem Push neu erzeugt.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
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

const rev = gitRevision();

const ghProfile = (c) =>
  c.login
    ? `<a href="https://github.com/${escapeHtml(c.login)}">${escapeHtml(c.login)}</a>`
    : escapeHtml(c.name);

let metaHtml = "";
if (rev) {
  // Summary-Zeile: Stand · Revision N (Datum) · Mitwirkende
  const summaryParts = [];
  if (stand) summaryParts.push(`Stand: ${escapeHtml(stand)}`);
  summaryParts.push(`Revision ${escapeHtml(rev.count)} (${escapeHtml(rev.date)})`);
  if (rev.contributors.length) {
    summaryParts.push(`(${rev.contributors.map(ghProfile).join(", ")})`);
  }

  // Aufklappbare, vollständige Änderungshistorie von entwurf.md
  const rows = rev.revisions
    .map(
      (r) => `<li>
            <a class="rev-hash" href="https://github.com/digimuwi/handleitung-ki/commit/${escapeHtml(r.hash)}"><code>${escapeHtml(r.shortHash)}</code></a>
            <span class="rev-date">${escapeHtml(r.date)}</span>
            <span class="rev-subject">${escapeHtml(r.subject)}</span>
            <span class="rev-author">${ghProfile(r)}</span>
          </li>`
    )
    .join("\n");

  metaHtml = `<details class="meta">
        <summary>${summaryParts.join(" · ")}</summary>
        <ol class="revlist">
${rows}
        </ol>
      </details>`;
} else if (stand) {
  metaHtml = `<p class="meta">Stand: ${escapeHtml(stand)}</p>`;
}

const html = template
  .replaceAll("{{TITLE}}", escapeHtml(title))
  .replace("{{META}}", metaHtml)
  .replace("{{CONTENT}}", contentHtml);

await mkdir(resolve(root, "dist"), { recursive: true });
await writeFile(resolve(root, "dist/index.html"), html, "utf8");
await writeFile(resolve(root, "dist/.nojekyll"), "", "utf8");

console.log("dist/index.html erzeugt.");

// Git-Revision des Textes (entwurf.md) zur Build-Zeit ermitteln, damit auf der
// Seite sichtbar ist, auf welchem inhaltlichen Stand gebaut wurde – Änderungen am
// Code drumherum zählen bewusst nicht. Schlägt lokal ohne Git nicht fehl.
function gitRevision() {
  try {
    const git = (args) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    const hash = git(["log", "-1", "--format=%H", "--", "entwurf.md"]);
    if (!hash) return null;
    const shortHash = git(["rev-parse", "--short", hash]);
    const iso = git(["log", "-1", "--format=%cI", "--", "entwurf.md"]);
    const date = new Intl.DateTimeFormat("de-DE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
    const count = git(["rev-list", "--count", "HEAD", "--", "entwurf.md"]);

    // Vollständige Änderungshistorie von entwurf.md (für das Accordion) sowie die
    // abgeleitete Contributor-Liste. Aus dem GitHub-noreply-Format
    // „ID+username@users.noreply.github.com" lässt sich der Account ableiten.
    const US = "\x1f"; // Feldtrenner
    const RS = "\x1e"; // Datensatztrenner
    const log = git([
      "log",
      `--format=%H${US}%h${US}%cI${US}%an${US}%ae${US}%s${RS}`,
      "--",
      "entwurf.md",
    ]);
    const fmtDate = (iso) =>
      new Intl.DateTimeFormat("de-DE", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(iso));
    const ghLogin = (email) => {
      const m = email && email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i);
      return m ? m[1] : null;
    };

    const revisions = [];
    const seen = new Set();
    const contributors = [];
    for (const rec of log.split(RS)) {
      const line = rec.replace(/^\n/, "");
      if (!line.trim()) continue;
      const [h, sh, iso, name, email, subject] = line.split(US);
      const login = ghLogin(email);
      revisions.push({ hash: h, shortHash: sh, date: fmtDate(iso), name, login, subject });
      const key = login || name;
      if (key && !seen.has(key)) {
        seen.add(key);
        contributors.push({ name, login });
      }
    }
    return { hash, shortHash, date, count, contributors, revisions };
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
