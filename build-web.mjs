import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentDir = path.join(root, "posts");
const staticImagesDir = path.join(root, "static", "images");
const outDir = path.join(root, "public");

const site = {
  title: "Move quietly and plant things",
  description: "Archiv textů o pohybu, zahradě, místě a pomalejším životě.",
  author: "Edgar Walden",
  baseUrl: "https://movequietly.eu",
};

const collator = new Intl.Collator("cs", { sensitivity: "base" });
const postAliases = new Map([
  ["davejte-pozor-na-to-co-opakujete", "davej-pozor-co-opakujes"],
]);
let knownPostSlugs = new Set();

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "index";
}

function parseScalar(raw = "") {
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function parseArray(raw = "") {
  const value = raw.trim();
  if (!value.startsWith("[") || !value.endsWith("]")) return [];
  const body = value.slice(1, -1).trim();
  if (!body) return [];
  return body
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((item) => parseScalar(item.trim()))
    .filter(Boolean);
}

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: source };

  const data = {};
  let section = null;
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    const nested = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (top) {
      section = top[1];
      const rawValue = top[2].trim();
      if (!rawValue) {
        data[section] = {};
      } else if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
        data[section] = parseArray(rawValue);
      } else {
        data[section] = parseScalar(rawValue);
      }
    } else if (nested && section && typeof data[section] === "object" && !Array.isArray(data[section])) {
      const rawValue = nested[2].replace(/\s+#.*$/, "").trim();
      data[section][nested[1]] = rawValue.startsWith("[") ? parseArray(rawValue) : parseScalar(rawValue);
    }
  }

  return { data, body: source.slice(match[0].length) };
}

function normalizeImage(src = "") {
  const clean = src.trim();
  if (/^https?:\/\//i.test(clean)) return clean;
  const file = clean.replaceAll("\\", "/").split("/").filter(Boolean).pop();
  return file ? `images/${file}` : clean.replace(/^\/+/, "");
}

function relativeAsset(asset, depth = 0) {
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  return `${prefix}${asset}`;
}

function imageSrc(src, depth = 0) {
  const normalized = normalizeImage(src);
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return relativeAsset(normalized, depth);
}

function rewriteHref(href, depth = 0) {
  const clean = href.trim();
  const match = clean.match(/^https?:\/\/(?:www\.)?movequietly\.eu\/posts\/([^/#?]+)\/?(?:[#?].*)?$/i);
  if (!match) return clean;

  const requestedSlug = match[1];
  const slug = knownPostSlugs.has(requestedSlug) ? requestedSlug : postAliases.get(requestedSlug);
  return slug ? postHref(slug, depth) : clean;
}

function inlineMarkdown(text, depth) {
  const tokens = [];
  let output = escapeHtml(text);

  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const token = `@@IMG${tokens.length}@@`;
    tokens.push(`<figure><img src="${escapeHtml(imageSrc(src, depth))}" alt="${escapeHtml(alt)}" loading="lazy"><figcaption>${escapeHtml(alt)}</figcaption></figure>`);
    return token;
  });

  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const token = `@@LINK${tokens.length}@@`;
    tokens.push(`<a href="${escapeHtml(rewriteHref(href, depth))}">${escapeHtml(label)}</a>`);
    return token;
  });

  output = output
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

  tokens.forEach((html, index) => {
    output = output.replaceAll(`@@IMG${index}@@`, html).replaceAll(`@@LINK${index}@@`, html);
  });

  return output;
}

function markdownToHtml(markdown, depth = 0) {
  const lines = markdown.replaceAll("<!-- more -->", "\n\n").split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let list = [];
  let inCode = false;
  let code = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    const content = inlineMarkdown(paragraph.join(" "), depth);
    if (content.trim().startsWith("<figure>") && content.trim().endsWith("</figure>")) {
      html.push(content);
    } else {
      html.push(`<p>${content}</p>`);
    }
    paragraph = [];
  }

  function flushList() {
    if (!list.length) return;
    html.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item, depth)}</li>`).join("")}</ul>`);
    list = [];
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = trimmed.match(/^(#{2,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2], depth)}</h${level}>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  if (inCode) html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  return html.join("\n");
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/<!-- more -->/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#*_`>-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(markdown, description) {
  if (description) return description;
  const beforeMore = markdown.split("<!-- more -->")[0];
  const text = stripMarkdown(beforeMore || markdown);
  return text.length > 220 ? `${text.slice(0, 217).trim()}...` : text;
}

function firstImage(markdown) {
  const match = markdown.match(/!\[[^\]]*]\(([^)]+)\)/);
  return match ? normalizeImage(match[1]) : "";
}

function removeDuplicateCoverImage(markdown, coverImage) {
  if (!coverImage) return markdown;
  let removed = false;
  return markdown.replace(/^\s*!\[[^\]]*]\(([^)]+)\)\s*$/m, (match, src) => {
    if (!removed && normalizeImage(src) === coverImage) {
      removed = true;
      return "";
    }
    return match;
  });
}

function pageShell({ title, description = site.description, body, depth = 0 }) {
  const home = relativeAsset("index.html", depth);
  const posts = relativeAsset("posts/index.html", depth);
  const categories = relativeAsset("categories/index.html", depth);
  const tags = relativeAsset("tags/index.html", depth);
  const css = relativeAsset("styles/site.css", depth);
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | ${escapeHtml(site.title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/water.css@2/out/light.css">
  <link rel="stylesheet" href="${css}">
</head>
<body>
  <header class="site-header">
    <div class="brand">
      <a class="site-title" href="${home}">${escapeHtml(site.title)}</a>
      <p class="site-subtitle">${escapeHtml(site.description)}</p>
    </div>
    <nav aria-label="Hlavní navigace">
      <a href="${posts}">Archiv</a>
      <a href="${categories}">Kategorie</a>
      <a href="${tags}">Tagy</a>
    </nav>
  </header>
  ${body}
  <footer class="site-footer">
    <p>${escapeHtml(site.title)} · statický archiv bez Huga</p>
  </footer>
</body>
</html>
`;
}

function postUrl(post, depth = 0) {
  return relativeAsset(`${post.slug}/index.html`, depth);
}

function postHref(slug, depth = 0) {
  return relativeAsset(`${slug}/index.html`, depth);
}

function termUrl(kind, term, depth = 0) {
  return relativeAsset(`${kind}/${slugify(term)}/index.html`, depth);
}

function dateLabel(date) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date || "";
  return parsed.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}

function renderTermLinks(kind, terms, depth) {
  if (!terms?.length) return "";
  return terms
    .map((term) => `<a href="${termUrl(kind, term, depth)}">${escapeHtml(term)}</a>`)
    .join(", ");
}

function renderPostCard(post, depth = 0) {
  const image = post.coverImage || post.firstImage;
  return `<article class="post-card">
  ${image ? `<a href="${postUrl(post, depth)}"><img src="${escapeHtml(imageSrc(image, depth))}" alt="${escapeHtml(post.coverAlt || post.title)}" loading="lazy"></a>` : ""}
  <h2><a href="${postUrl(post, depth)}">${escapeHtml(post.title)}</a></h2>
  <p class="meta">${dateLabel(post.date)}${post.categories.length ? ` · ${renderTermLinks("categories", post.categories, depth)}` : ""}</p>
  <p>${escapeHtml(post.summary)}</p>
</article>`;
}

function renderPostList(posts, heading, depth = 0) {
  return `<main>
  <h1>${escapeHtml(heading)}</h1>
  <div class="post-list">
    ${posts.map((post) => renderPostCard(post, depth)).join("\n")}
  </div>
</main>`;
}

async function writeHtml(file, html) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html, "utf8");
}

async function copyImages() {
  const target = path.join(outDir, "images");
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(staticImagesDir)) {
    const source = path.join(staticImagesDir, entry);
    if ((await stat(source)).isFile()) {
      await copyFile(source, path.join(target, entry));
    }
  }
}

async function loadPosts() {
  const files = (await readdir(contentDir)).filter((file) => file.endsWith(".md")).sort();
  const posts = [];
  for (const file of files) {
    const source = await readFile(path.join(contentDir, file), "utf8");
    const { data, body } = parseFrontmatter(source);
    const slug = file.replace(/\.md$/, "");
    posts.push({
      slug,
      title: data.title || slug,
      date: data.date || "",
      author: data.author || site.author,
      tags: Array.isArray(data.tags) ? data.tags : [],
      categories: Array.isArray(data.categories) ? data.categories : [],
      description: data.description || "",
      coverImage: data.cover?.image ? normalizeImage(data.cover.image) : "",
      coverAlt: data.cover?.alt || "",
      coverCaption: data.cover?.caption || "",
      firstImage: firstImage(body),
      summary: excerpt(body, data.description),
      body,
    });
  }
  const sorted = posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  knownPostSlugs = new Set(sorted.map((post) => post.slug));
  return sorted;
}

function groupByTerm(posts, key) {
  const groups = new Map();
  for (const post of posts) {
    for (const term of post[key]) {
      if (!groups.has(term)) groups.set(term, []);
      groups.get(term).push(post);
    }
  }
  return [...groups.entries()].sort(([a], [b]) => collator.compare(a, b));
}

function renderHome(posts, categories, tags) {
  const newest = posts.slice(0, 8);
  const topTags = tags.slice(0, 24);
  return `<main>
  <section>
    <h2>Nejnovější texty</h2>
    <div class="post-list">
      ${newest.map((post) => renderPostCard(post, 0)).join("\n")}
    </div>
    <p><a href="posts/index.html">Celý archiv</a></p>
  </section>
  <section class="term-cloud">
    <h2>Kategorie</h2>
    <p>${categories.map(([term, list]) => `<a href="${termUrl("categories", term, 0)}">${escapeHtml(term)} <span>${list.length}</span></a>`).join(" ")}</p>
  </section>
  <details class="term-cloud">
    <summary>Tagy</summary>
    <p>${topTags.map(([term, list]) => `<a href="${termUrl("tags", term, 0)}">${escapeHtml(term)} <span>${list.length}</span></a>`).join(" ")}</p>
    <p><a href="tags/index.html">Všechny tagy</a></p>
  </details>
</main>`;
}

function renderPost(post, posts) {
  const index = posts.findIndex((item) => item.slug === post.slug);
  const newer = posts[index - 1];
  const older = posts[index + 1];
  const image = post.coverImage || post.firstImage;
  const articleBody = removeDuplicateCoverImage(post.body, image);
  const body = `<main>
  <article>
    <header class="post-head">
      <p class="meta">${dateLabel(post.date)} · ${escapeHtml(post.author)}</p>
      <h1>${escapeHtml(post.title)}</h1>
      ${post.categories.length ? `<p class="meta">Kategorie: ${renderTermLinks("categories", post.categories, 1)}</p>` : ""}
      ${post.tags.length ? `<p class="tag-list">${post.tags.map((tag) => `<a href="${termUrl("tags", tag, 1)}">${escapeHtml(tag)}</a>`).join("")}</p>` : ""}
    </header>
    ${image ? `<figure class="cover"><img src="${escapeHtml(imageSrc(image, 1))}" alt="${escapeHtml(post.coverAlt || post.title)}" loading="eager">${post.coverCaption ? `<figcaption>${escapeHtml(post.coverCaption)}</figcaption>` : ""}</figure>` : ""}
    ${markdownToHtml(articleBody, 1)}
  </article>
  <nav class="post-nav" aria-label="Navigace mezi články">
    ${older ? `<a href="${postHref(older.slug, 1)}"><span>Starší</span>${escapeHtml(older.title)}</a>` : "<span></span>"}
    ${newer ? `<a href="${postHref(newer.slug, 1)}"><span>Novější</span>${escapeHtml(newer.title)}</a>` : "<span></span>"}
  </nav>
</main>`;
  return pageShell({ title: post.title, description: post.summary, body, depth: 1 });
}

async function main() {
  const posts = await loadPosts();
  const categories = groupByTerm(posts, "categories");
  const tags = groupByTerm(posts, "tags");

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await copyImages();

  await writeHtml(path.join(outDir, "styles", "site.css"), `:root {
  color-scheme: light;
}

body {
  max-width: 900px;
  background: #fbfaf6;
  color: #202124;
}

.site-header {
  margin-bottom: 3.5rem;
  border-bottom: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  padding-bottom: 1rem;
}

.brand {
  margin-bottom: 1rem;
}

.site-title {
  display: inline-block;
  font-weight: 400;
  font-size: clamp(1.5rem, 4.7vw, 3.17rem);
  line-height: .95;
  text-decoration: none;
  color: inherit;
}

.site-subtitle {
  max-width: 42rem;
  margin: .75rem 0 0;
  color: #55524b;
  font-size: 1.1rem;
}

.site-header nav {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.post-list {
  display: grid;
  gap: 2rem;
}

.post-card {
  padding-bottom: 1.5rem;
  border-bottom: 1px solid color-mix(in srgb, currentColor 14%, transparent);
}

.post-card img,
.cover img,
figure img {
  width: 100%;
  height: auto;
  border-radius: 6px;
  background: #eee9df;
}

.post-card h2 {
  margin-bottom: .35rem;
}

.meta,
figcaption,
.site-footer {
  color: color-mix(in srgb, currentColor 65%, transparent);
  font-size: .92rem;
}

.term-cloud a {
  display: inline-block;
  margin: 0 .5rem .5rem 0;
}

.term-cloud span {
  opacity: .72;
}

.post-head {
  margin-bottom: 1.5rem;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: .45rem;
  margin-top: 1rem;
}

.tag-list a {
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 999px;
  padding: .18rem .55rem;
  text-decoration: none;
}

.cover {
  margin: 0 0 2rem;
}

.post-nav {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid color-mix(in srgb, currentColor 18%, transparent);
}

.post-nav a {
  display: block;
  max-width: 48%;
}

.post-nav a:last-child {
  margin-left: auto;
  text-align: right;
}

.post-nav span {
  display: block;
  color: color-mix(in srgb, currentColor 60%, transparent);
  font-size: .85rem;
  margin-bottom: .15rem;
}

.site-footer {
  margin-top: 4rem;
  padding-top: 1rem;
  border-top: 1px solid color-mix(in srgb, currentColor 18%, transparent);
}

@media (max-width: 640px) {
  .post-nav {
    display: block;
  }

  .post-nav a {
    max-width: none;
    margin-bottom: 1rem;
  }

  .post-nav a:last-child {
    text-align: left;
  }
}
`);

  await writeHtml(path.join(outDir, "index.html"), pageShell({
    title: "Domů",
    body: renderHome(posts, categories, tags),
  }));

  await writeHtml(path.join(outDir, "posts", "index.html"), pageShell({
    title: "Archiv",
    body: renderPostList(posts, "Archiv", 1),
    depth: 1,
  }));

  for (const post of posts) {
    await writeHtml(path.join(outDir, post.slug, "index.html"), renderPost(post, posts));
  }

  const termIndex = (heading, groups, kind) => `<main>
  <h1>${escapeHtml(heading)}</h1>
  <ul>
    ${groups.map(([term, list]) => `<li><a href="${slugify(term)}/index.html">${escapeHtml(term)}</a> (${list.length})</li>`).join("\n")}
  </ul>
</main>`;

  await writeHtml(path.join(outDir, "categories", "index.html"), pageShell({
    title: "Kategorie",
    body: termIndex("Kategorie", categories, "categories"),
    depth: 1,
  }));

  for (const [term, list] of categories) {
    await writeHtml(path.join(outDir, "categories", slugify(term), "index.html"), pageShell({
      title: `Kategorie: ${term}`,
      body: renderPostList(list, `Kategorie: ${term}`, 2),
      depth: 2,
    }));
  }

  await writeHtml(path.join(outDir, "tags", "index.html"), pageShell({
    title: "Tagy",
    body: termIndex("Tagy", tags, "tags"),
    depth: 1,
  }));

  for (const [term, list] of tags) {
    await writeHtml(path.join(outDir, "tags", slugify(term), "index.html"), pageShell({
      title: `Tag: ${term}`,
      body: renderPostList(list, `Tag: ${term}`, 2),
      depth: 2,
    }));
  }

  const sitemap = posts
    .map((post) => `${post.slug}/index.html`)
    .concat(["index.html", "posts/index.html", "categories/index.html", "tags/index.html"])
    .join("\n");
  await writeFile(path.join(outDir, "sitemap.txt"), `${sitemap}\n`, "utf8");

  console.log(`Generated ${posts.length} posts, ${categories.length} categories and ${tags.length} tags in ${outDir}`);
}

await main();
