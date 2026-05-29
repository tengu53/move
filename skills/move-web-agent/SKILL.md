---
name: move-web-agent
description: Project workflow for maintaining the Move quietly static blog. Use when working in this repository on build-web.mjs, posts/*.md, static/images, public output, TODO.md, log.md, Netlify deploy settings, or generated blog pages.
---

# Move Web Agent

## Workflow

- Treat `posts/*.md` and `static/images` as source content.
- Treat `build-web.mjs` as the source of truth for templates, layout, routing, RSS/sitemap generation, and generated assets.
- Treat `public` as generated output. Do not hand-edit files in `public`; change the generator or source content, then run `node build-web.mjs`.
- Keep `netlify.toml` aligned with the current build command and publish directory.
- Record meaningful project changes in `log.md` after implementation.

## Editing Rules

- Prefer small, reversible changes in `build-web.mjs`.
- Preserve Czech text and diacritics in user-facing content.
- Keep URLs stable unless the task explicitly asks to change URL structure.
- When changing generated pages, rebuild and verify local links.
- Keep Water CSS as the base stylesheet unless the user explicitly changes the design direction.

## Verification

Run these after structural or template changes:

```powershell
node build-web.mjs
```

Then check generated local links in `public`. If a preview server is needed, use:

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory public
```

## Logging

Append a short dated entry to `log.md` for completed changes. Include:

- changed area
- why it changed
- verification performed
