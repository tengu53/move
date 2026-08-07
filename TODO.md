# Plan vyvoje webu

Pracovni plan pro novy staticky web ve slozce `public`, generovany z Markdown souboru pres `build-web.mjs` a stylovany pomoci Water CSS.

## Nejblizsi upravy

- [x] Ujasnit cilovou strukturu webu: homepage, archiv, clanky, kategorie, tagy.
- [x] Rozhodnout, jestli zustanou URL ve tvaru `posts/nazev-clanku/index.html`, nebo se zkrati na jednodussi adresy.
- [x] Upravit hlavičku webu - jeden velký napis a podtitul
- [x] Web bude světlý, ne tmavý
- [x] Přejmenovat "content" na "posts". Přejmenovat "Web" na "public". 
- [x] Doladit homepage: pocet nejnovejsich clanku, uvodni text, poradi bloku, viditelnost kategorii a tagu.
- [x] Upravit sablonu detailu clanku: metadata, cover obrazek, tagy, navigace predchozi/dalsi.
- [x] Zkontrolovat vsechny obrazky a odstranit duplicitni zobrazeni cover obrazku v clancich, kde je stejny obrazek i v textu.
- [x] Projit stare odkazy v textech a prevest interni odkazy na nove staticke URL.
- [x] Vytvořit log.md na logování změn
- [x] vytvořit skill, kde bude popsáno chování AI agenta
- [x] zmenšit nadpis blogu o třetinu a dát ho netučně
- [x] možná jen informace - základní adresa webu bude https://movequietly.eu
- [x] Upravit .gitignore podle aktuálních požadavků
- [x] Doplnit složku inbox, kde se budou dávat texty a obsah pro AI procesing
- [x] Doplnit do skillu wowkflow (Inbox - processing (doplnění tagů, překopírování do složek atd.) - generování)
- [x] Doplnit soubor s README a návodem


## Obsah a redakcni vrstva

- [x] Doplnit perexy nebo kratke popisy u clanku, ktere nemaji `description`.
- [x] Sjednotit tagy s diakritikou a bez diakritiky, napriklad `Hostyn` vs. `Hostýn`.
- [x] Zrevidovat kategorie a zvazit, jestli jich nema byt mene a stabilnejsich.
- [x] Zkontrolovat preklepy u importovanych clanku.

## Technicke doplneni

- [x] Pridat generovani RSS feedu bez Huga.
- [x] Pridat `sitemap.xml` misto soucasneho jednoducheho `sitemap.txt`.
- [x] Pridat `robots.txt`.
- [x] Doplnit Open Graph metadata pro sdileni clanku.
- [x] Pridat kanonicke URL podle finalni domeny.
- [x] Pridat jednoduchou kontrolu rozbitych odkazu jako samostatny prikaz.
- [x] Zajistit, aby build sel spustit jednim prikazem a jasne vypsal pocet vygenerovanych stran.
- [x] Doplnit sémantické značky <article>, <header> atd.

## Design a UX

- [ ] Doladit vlastni CSS nad Water CSS: sirka obsahu, mezery, obrazky, navigace.
- [ ] Zlepsit mobilni zobrazeni navigace.
- [ ] Pridat citelnejsi vypis tagu a kategorii.
- [ ] Rozhodnout, jestli ma homepage pusobit jako blog, archiv, nebo osobni rozcestnik.
- [ ] Zkontrolovat kontrast, velikosti obrazku a chovani dlouhych nadpisu.

## Pozdejsi napady

- [ ] Zmensovat obrazky pri buildu a generovat nahledy.
- [ ] Pripravit jednoduchy deploy postup pro novy generator.
- [ ] Zalozit README s popisem, jak web generovat a publikovat.

## Hotovo

- [x] Vygenerovan zakladni staticky web do `public`.
- [x] Pouzit Water CSS pres CDN.
- [x] Vygenerovan archiv clanku, kategorie a tagy.
- [x] Zkopirovany obrazky do `public/images`.
- [x] Overeny lokalni odkazy a obrazky.
