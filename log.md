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

## 2026-06-03

- Zpracovan novy inbox text `uakž-mi-své-mycelium.md` do clanku `posts/spory-z-blizke-budoucnosti.md`, vcetne front matteru, perexu, tagu a kategorie.
- Doplnene semanticke znacky do sablon archivnich a terminovych stranek v `build-web.mjs`; overeno pres `node build-web.mjs --check-links`.
- Zpracovan novy inbox text `abstinence_je_nový_punk.md` do clanku `posts/abstinence-je-novy-punk.md`, vcetne front matteru, perexu, tagu, kategorie a opravy zjevnych preklepu.
- Doplnen obrazek `neo-sober-edge.jpg` k postu `abstinence-je-novy-punk`, vcetne popisku `Obr: Nano-bana AI`.
- Zpracovan novy inbox text `taktilní_grafický_vzdor.md` do clanku `posts/taktilni-graficky-vzdor.md`; obrazek `taktilní_radikalismus.png` zkopirovan jako `static/images/taktilni-radikalismus.png` a doplnen s popiskem `Obr: Nano-bana AI`.
- Upraven nadpis clanku `taktilni-graficky-vzdor` podle aktualizace v inboxu; URL zustala beze zmeny.
- Znovu upraven nadpis clanku `taktilni-graficky-vzdor` na `Taktilní grafický vzdor: Inkoust, chyby a zrno`.
