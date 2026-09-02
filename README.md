# Move quietly and plant things

Staticky blog generovany vlastnim Node skriptem bez Huga.

## Struktura

- `posts/` - zdrojove Markdown clanky
- `pages/` - zdrojove Markdown stranky mimo archiv clanku
- `static/images/` - zdrojove obrazky pouzivane clanky
- `inbox/` - pracovni vstupy pro AI processing
- `build-web.mjs` - generator webu
- `public/` - generovany vystup, neverzuje se
- `TODO.md` - plan prace
- `log.md` - log zmen
- `skills/move-web-agent/` - projektovy skill pro AI agenta

## Build

```powershell
node build-web.mjs
```

Generator nacte clanky z `posts`, stranky z `pages`, zkopiruje obrazky ze `static/images` a vytvori web v `public`.
Soucasti vystupu jsou HTML stranky, RSS feed, `sitemap.xml`, `robots.txt`, kanonicke URL a Open Graph metadata.

## Kontrola odkazu

```powershell
node build-web.mjs --check-links
```

Prikaz nejdriv vygeneruje web a potom zkontroluje lokalni odkazy a obrazky v HTML vystupu.

## Lokalni nahled

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory public
```

Pak otevrit:

```text
http://127.0.0.1:8765/
```

## Publikovani

Netlify pouziva:

```toml
[build]
  publish = "public"
  command = "node build-web.mjs"
```

Zdrojem pravdy jsou `posts`, `pages`, `static/images` a `build-web.mjs`; adresar `public` se pri buildu vytvari znovu.

## Workflow noveho clanku

1. Vlozit surovy text a podklady do `inbox`.
2. Zpracovat text do Markdown clanku s frontmatterem.
3. Ulozit clanek do `posts/<slug>.md`.
4. Finalni obrazky ulozit do `static/images`.
5. Spustit `node build-web.mjs --check-links`.
6. Zkontrolovat lokalni nahled a odkazy.

Opakovatelny helper pro mechanickou cast workflow:

```powershell
python scripts/process_inbox.py run
```

Prikaz zpracuje nejnovejsi Markdown v `inbox`, vytvori post v `posts`, pripadne zkopiruje nejpodobneji pojmenovany obrazek do `static/images`, doplni `image`, `image_alt` a `image_caption` s popiskem `Obr: Nano-bana AI` a spusti `node build-web.mjs --check-links`.

Metadata lze upresnit argumenty, napriklad:

```powershell
python scripts/process_inbox.py run muj-draft.md --category lifespan --tags "abstinence,nealko,zivotni styl"
```
