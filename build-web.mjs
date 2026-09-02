import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentDir = path.join(root, "posts");
const pagesDir = path.join(root, "pages");
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

function absoluteUrl(pathname = "/") {
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(cleanPath, site.baseUrl).href;
}

function postPermalink(slug) {
  return `/${slug}/`;
}

function pagePermalink(slug) {
  return `/${slug}/`;
}

function termPermalink(kind, term) {
  return `/${kind}/${slugify(term)}/`;
}

function xmlDate(date) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const parsed = new Date(`${date}T00:00:00+01:00`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function metaDateTime(date) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T00:00:00+01:00`;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function rssDate(date) {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? new Date().toUTCString() : parsed.toUTCString();
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

function pageShell({
  title,
  description = site.description,
  body,
  depth = 0,
  canonicalPath = "/",
  ogType = "website",
  ogImage = "",
  publishedTime = "",
}) {
  const home = relativeAsset("index.html", depth);
  const posts = relativeAsset("posts/index.html", depth);
  const categories = relativeAsset("categories/index.html", depth);
  const tags = relativeAsset("tags/index.html", depth);
  const about = relativeAsset("about/index.html", depth);
  const css = relativeAsset("styles/site.css", depth);
  const canonicalUrl = absoluteUrl(canonicalPath);
  const pageTitle = `${title} | ${site.title}`;
  const socialImage = ogImage ? absoluteUrl(normalizeImage(ogImage)) : "";
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(site.title)} RSS" href="${escapeHtml(absoluteUrl("/rss.xml"))}">
  <meta property="og:site_name" content="${escapeHtml(site.title)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  ${socialImage ? `<meta property="og:image" content="${escapeHtml(socialImage)}">` : ""}
  ${publishedTime ? `<meta property="article:published_time" content="${escapeHtml(metaDateTime(publishedTime))}">` : ""}
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
      <a href="${about}">O mně</a>
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
  return `<article class="post-card${image ? " has-image" : ""}">
  ${image ? `<a class="post-card-image" href="${postUrl(post, depth)}"><img src="${escapeHtml(imageSrc(image, depth))}" alt="${escapeHtml(post.coverAlt || post.title)}" loading="lazy"></a>` : ""}
  <h2><a href="${postUrl(post, depth)}">${escapeHtml(post.title)}</a></h2>
  <p class="meta">${dateLabel(post.date)}${post.categories.length ? ` · ${renderTermLinks("categories", post.categories, depth)}` : ""}</p>
  <p class="post-summary">${escapeHtml(post.summary)}</p>
</article>`;
}

function renderPostList(posts, heading, depth = 0) {
  return `<main>
  <header class="page-head">
    <h1>${escapeHtml(heading)}</h1>
  </header>
  <section class="post-list" aria-label="${escapeHtml(heading)}">
    ${posts.map((post) => renderPostCard(post, depth)).join("\n")}
  </section>
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
      coverImage: data.image ? normalizeImage(data.image) : data.cover?.image ? normalizeImage(data.cover.image) : "",
      coverAlt: data.image_alt || data.cover?.alt || "",
      coverCaption: data.image_caption || data.cover?.caption || "",
      firstImage: firstImage(body),
      summary: excerpt(body, data.description),
      body,
    });
  }
  const sorted = posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  knownPostSlugs = new Set(sorted.map((post) => post.slug));
  return sorted;
}

async function loadPages() {
  const files = (await readdir(pagesDir)).filter((file) => file.endsWith(".md")).sort();
  const pages = [];
  for (const file of files) {
    const source = await readFile(path.join(pagesDir, file), "utf8");
    const { data, body } = parseFrontmatter(source);
    const fallbackSlug = file.replace(/\.md$/, "");
    pages.push({
      slug: data.slug || fallbackSlug,
      title: data.title || fallbackSlug,
      description: data.description || site.description,
      body,
    });
  }
  return pages;
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
  <section class="home-blog" aria-labelledby="home-posts-heading">
    <header class="section-head">
      <h1 id="home-posts-heading">Nejnovější texty</h1>
      <a href="posts/index.html">Celý archiv</a>
    </header>
    <div class="post-list">
      ${newest.map((post) => renderPostCard(post, 0)).join("\n")}
    </div>
  </section>
  <section class="term-cloud secondary-nav">
    <h2>Kategorie</h2>
    <p>${categories.map(([term, list]) => `<a href="${termUrl("categories", term, 0)}">${escapeHtml(term)} <span>${list.length}</span></a>`).join(" ")}</p>
  </section>
  <details class="term-cloud secondary-nav">
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
  return pageShell({
    title: post.title,
    description: post.summary,
    body,
    depth: 1,
    canonicalPath: postPermalink(post.slug),
    ogType: "article",
    ogImage: image,
    publishedTime: post.date,
  });
}

function renderPage(page) {
  const body = `<main>
  <article>
    <header class="post-head">
      <h1>${escapeHtml(page.title)}</h1>
      ${page.description ? `<p class="meta">${escapeHtml(page.description)}</p>` : ""}
    </header>
    ${markdownToHtml(page.body, 1)}
  </article>
</main>`;
  return pageShell({
    title: page.title,
    description: page.description,
    body,
    depth: 1,
    canonicalPath: pagePermalink(page.slug),
  });
}

function renderRss(posts) {
  const items = posts.slice(0, 20).map((post) => {
    const url = absoluteUrl(postPermalink(post.slug));
    return `  <item>
    <title>${escapeHtml(post.title)}</title>
    <link>${escapeHtml(url)}</link>
    <guid>${escapeHtml(url)}</guid>
    <pubDate>${escapeHtml(rssDate(post.date))}</pubDate>
    <description>${escapeHtml(post.summary)}</description>
  </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeHtml(site.title)}</title>
  <link>${escapeHtml(absoluteUrl("/"))}</link>
  <description>${escapeHtml(site.description)}</description>
  <language>cs</language>
  <atom:link href="${escapeHtml(absoluteUrl("/rss.xml"))}" rel="self" type="application/rss+xml" />
${items}
</channel>
</rss>
`;
}

function renderSitemap(entries) {
  const urls = entries.map((entry) => {
    const lastmod = entry.lastmod ? `\n    <lastmod>${escapeHtml(entry.lastmod)}</lastmod>` : "";
    return `  <url>
    <loc>${escapeHtml(absoluteUrl(entry.path))}</loc>${lastmod}
  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function renderRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${absoluteUrl("/sitemap.xml")}
`;
}

async function pathExists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function collectHtmlFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectHtmlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(full);
    }
  }
  return files;
}

async function checkLinks() {
  const htmlFiles = await collectHtmlFiles(outDir);
  const broken = [];
  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const value = match[1];
      if (/^(https?:|mailto:|#)/i.test(value)) continue;
      const target = path.resolve(path.dirname(file), value.split("#")[0].split("?")[0]);
      if (!await pathExists(target)) {
        broken.push(`${path.relative(outDir, file)} -> ${value}`);
      }
    }
  }

  if (broken.length) {
    throw new Error(`Broken local links:\n${broken.join("\n")}`);
  }

  console.log(`Checked ${htmlFiles.length} HTML files: no broken local links.`);
}

async function main() {
  const posts = await loadPosts();
  const pages = await loadPages();
  const categories = groupByTerm(posts, "categories");
  const tags = groupByTerm(posts, "tags");

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await copyImages();

  await writeHtml(path.join(outDir, "styles", "site.css"), `:root {
  color-scheme: light;
  --page-bg: #fbfaf6;
  --text: #202124;
  --muted: #5d5a52;
  --line: #ddd6c8;
  --soft: #f2efe7;
  --accent: #245d54;
  --accent-soft: #d9ebe6;
  --link: #174ea6;
}

body {
  max-width: 880px;
  background: var(--page-bg);
  color: var(--text);
  line-height: 1.68;
}

main {
  margin-top: 0;
}

a {
  color: var(--link);
  text-underline-offset: .14em;
}

h1,
h2,
h3 {
  line-height: 1.18;
  overflow-wrap: anywhere;
}

.site-header {
  margin-bottom: 2.75rem;
  border-bottom: 1px solid var(--line);
  padding-bottom: 1.15rem;
}

.brand {
  margin-bottom: 1.15rem;
}

.site-title {
  display: inline-block;
  font-weight: 400;
  font-size: clamp(1.9rem, 4vw, 3rem);
  line-height: .95;
  text-decoration: none;
  color: inherit;
  max-width: 12ch;
}

.site-subtitle {
  max-width: 42rem;
  margin: .75rem 0 0;
  color: var(--muted);
  font-size: 1.05rem;
}

.site-header nav {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  align-items: center;
}

.site-header nav a {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: .38rem .7rem;
  background: rgba(255, 255, 255, .42);
  color: var(--text);
  line-height: 1.2;
  text-decoration: none;
}

.site-header nav a:hover,
.site-header nav a:focus-visible {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.35rem;
}

.section-head h1 {
  margin: 0;
  font-size: clamp(1.85rem, 3.7vw, 2.6rem);
}

.section-head a {
  flex: 0 0 auto;
  font-size: .95rem;
  white-space: nowrap;
}

.home-blog {
  margin-bottom: 3rem;
}

.post-list {
  display: grid;
  gap: 1.55rem;
}

.post-card {
  padding-bottom: 1.55rem;
  border-bottom: 1px solid var(--line);
}

.post-card.has-image {
  display: grid;
  grid-template-columns: minmax(0, 220px) minmax(0, 1fr);
  column-gap: 1.25rem;
  row-gap: .25rem;
  align-items: start;
}

.post-card.has-image > :not(.post-card-image) {
  grid-column: 2;
}

.post-card-image {
  grid-row: 1 / span 3;
  grid-column: 1;
  display: block;
  margin-top: .15rem;
}

.post-card img,
.cover img,
figure img {
  width: 100%;
  height: auto;
  border-radius: 6px;
  background: var(--soft);
}

.post-card img {
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.post-card h2 {
  margin: 0 0 .3rem;
  font-size: clamp(1.25rem, 2.4vw, 1.65rem);
}

.post-card h2 a {
  color: inherit;
  text-decoration-thickness: 1px;
}

.post-summary {
  margin: .45rem 0 0;
  color: #343536;
}

.meta,
figcaption,
.site-footer {
  color: var(--muted);
  font-size: .92rem;
}

.meta {
  margin: 0;
}

.secondary-nav {
  margin-top: 2.25rem;
  padding-top: 1.35rem;
  border-top: 1px solid var(--line);
}

.secondary-nav h2 {
  margin-top: 0;
  font-size: 1.18rem;
}

.term-cloud p {
  margin-bottom: 0;
}

.term-cloud summary {
  cursor: pointer;
  color: var(--text);
  font-weight: 600;
}

.term-cloud a {
  display: inline-block;
  margin: 0 .35rem .45rem 0;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: .2rem .5rem;
  background: rgba(255, 255, 255, .35);
  color: var(--text);
  font-size: .95rem;
  line-height: 1.35;
  text-decoration: none;
}

.term-cloud a:hover,
.term-cloud a:focus-visible,
.tag-list a:hover,
.tag-list a:focus-visible {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.term-cloud span {
  color: var(--muted);
  font-size: .85em;
}

.post-head {
  margin-bottom: 1.5rem;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: .42rem;
  margin-top: 1rem;
}

.tag-list a {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: .18rem .5rem;
  color: var(--text);
  font-size: .92rem;
  line-height: 1.35;
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
  border-top: 1px solid var(--line);
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
  color: var(--muted);
  font-size: .85rem;
  margin-bottom: .15rem;
}

.site-footer {
  margin-top: 4rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}

@media (max-width: 640px) {
  body {
    max-width: 100%;
    padding: 1rem;
  }

  .site-header {
    margin-bottom: 2rem;
  }

  .site-title {
    max-width: none;
    font-size: 2rem;
  }

  .site-subtitle {
    font-size: 1rem;
  }

  .site-header nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: .5rem;
  }

  .site-header nav a {
    padding: .55rem .65rem;
    text-align: center;
  }

  .section-head {
    display: block;
  }

  .section-head h1 {
    margin-bottom: .35rem;
  }

  .post-card.has-image {
    display: block;
  }

  .post-card-image {
    margin: 0 0 .85rem;
  }

  .post-card h2 {
    font-size: 1.35rem;
  }

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
    canonicalPath: "/",
  }));

  await writeHtml(path.join(outDir, "posts", "index.html"), pageShell({
    title: "Archiv",
    body: renderPostList(posts, "Archiv", 1),
    depth: 1,
    canonicalPath: "/posts/",
  }));

  for (const post of posts) {
    await writeHtml(path.join(outDir, post.slug, "index.html"), renderPost(post, posts));
  }

  for (const page of pages) {
    await writeHtml(path.join(outDir, page.slug, "index.html"), renderPage(page));
  }

  const termIndex = (heading, groups, kind) => `<main>
  <header class="page-head">
    <h1>${escapeHtml(heading)}</h1>
  </header>
  <section aria-label="${escapeHtml(heading)}">
  <ul>
    ${groups.map(([term, list]) => `<li><a href="${slugify(term)}/index.html">${escapeHtml(term)}</a> (${list.length})</li>`).join("\n")}
  </ul>
  </section>
</main>`;

  await writeHtml(path.join(outDir, "categories", "index.html"), pageShell({
    title: "Kategorie",
    body: termIndex("Kategorie", categories, "categories"),
    depth: 1,
    canonicalPath: "/categories/",
  }));

  for (const [term, list] of categories) {
    await writeHtml(path.join(outDir, "categories", slugify(term), "index.html"), pageShell({
      title: `Kategorie: ${term}`,
      body: renderPostList(list, `Kategorie: ${term}`, 2),
      depth: 2,
      canonicalPath: termPermalink("categories", term),
    }));
  }

  await writeHtml(path.join(outDir, "tags", "index.html"), pageShell({
    title: "Tagy",
    body: termIndex("Tagy", tags, "tags"),
    depth: 1,
    canonicalPath: "/tags/",
  }));

  for (const [term, list] of tags) {
    await writeHtml(path.join(outDir, "tags", slugify(term), "index.html"), pageShell({
      title: `Tag: ${term}`,
      body: renderPostList(list, `Tag: ${term}`, 2),
      depth: 2,
      canonicalPath: termPermalink("tags", term),
    }));
  }

  const sitemapEntries = [
    { path: "/" },
    { path: "/posts/" },
    { path: "/categories/" },
    { path: "/tags/" },
    ...pages.map((page) => ({ path: pagePermalink(page.slug) })),
    ...posts.map((post) => ({ path: postPermalink(post.slug), lastmod: xmlDate(post.date).slice(0, 10) })),
    ...categories.map(([term]) => ({ path: termPermalink("categories", term) })),
    ...tags.map(([term]) => ({ path: termPermalink("tags", term) })),
  ];
  await writeFile(path.join(outDir, "rss.xml"), renderRss(posts), "utf8");
  await writeFile(path.join(outDir, "sitemap.xml"), renderSitemap(sitemapEntries), "utf8");
  await writeFile(path.join(outDir, "robots.txt"), renderRobots(), "utf8");

  const htmlPages = 1 + 1 + 1 + 1 + pages.length + posts.length + categories.length + tags.length;
  console.log(`Generated ${htmlPages} HTML pages, ${posts.length} posts, ${pages.length} pages, ${categories.length} categories, ${tags.length} tags, RSS, sitemap.xml and robots.txt in ${outDir}`);

  if (process.argv.includes("--check-links")) {
    await checkLinks();
  }
}

await main();
