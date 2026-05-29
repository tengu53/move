# Log zmen

## 2026-05-29

- Prechod z Huga na vlastni staticky generator `build-web.mjs`.
- Zdrojove clanky presunuty do `posts`, vystup webu presunut do `public`.
- Netlify konfigurace nastavena na `node build-web.mjs` a publish adresar `public`.
- Doplnene projektove TODO a zalozen skill `skills/move-web-agent` pro pravidla prace AI agenta.
- Upraven vzhled hlavicky webu a overen build prikazem `node build-web.mjs`.
- Nastavena zakladni adresa `https://movequietly.eu` a zjednodusene URL clanku na root slugs typu `/nazev-clanku/`.
- Doplnene pravidlo pro neverzovani generovaneho `public`, zalozen `inbox` pro AI processing a README s navodem.
- Dokoncena redakcni vrstva: doplnene chybejici popisy, tagy a kategorie, zredukovane kategorie na stabilni sadu a opraveny zjevne importni preklepy.
- Pridana staticka stranka `O mne` z inboxu, vcetne podpory jednoduchych stranek v generatoru a obrazku Brna.
- Dokoncena technicka doplneni: RSS, `sitemap.xml`, `robots.txt`, kanonicke URL, Open Graph metadata a kontrola lokalnich odkazu pres `node build-web.mjs --check-links`.
