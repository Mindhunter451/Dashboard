# Jeres Tagescockpit

Persönliches Dashboard mit eigenen Seiten, zum Beispiel für Übersicht, Arbeit, Privat, Fokus und Sport. Oben ein Himmel, der dem echten Sonnenstand folgt, mit großer Uhr und Sonnenbogen. Drin sind Urlaubstage, Fortschrittsbalken, Wetter mit Regenradar, Pendeln mit Staus und Baustellen, Todoist-Aufgaben, iCloud-Kalender, Vers des Tages, Schnellzugriff, Notizen, Pomodoro, Gewohnheiten, Lernfortschritt, Fußball, Formel 1 und Spritpreise. Dazu ein schwarzer Spiegel-Modus für einen Smart Mirror.

Live: https://mindhunter451.github.io/Dashboard/

## Bedienen

Oben wechselst du die Seiten, per Klick, mit den Tasten 1 bis 9 oder über die Adresse, zum Beispiel `…/Dashboard/#arbeit`.
Mit **Bearbeiten** legst du Seiten an, benennst sie um und sortierst sie. Auf jeder Karte kannst du dann verschieben, die Breite ändern, Einstellungen öffnen oder sie von der Seite nehmen. Über **Widget hinzufügen** legst du neue Widgets an oder holst vorhandene auf die Seite.
Unter **Anpassen** sind Design, Akzentfarbe, Himmel an oder aus, Kacheln, Countdowns, Bundesland, die Startseite und die Sicherung.
**Spiegel** (oder die Taste S) zeigt Uhr, Wetter, Termine, Countdowns und den Vers auf Schwarz, im Vollbild. Mit `…/Dashboard/#spiegel` startet die Seite direkt so, praktisch für einen Kiosk-Browser am Smart Mirror. Raus geht es mit Esc.

## Daten

Alles, was du einstellst, liegt nur im Browser (localStorage), getrennt für jede Adresse und jeden Browser. Der Todoist-Token, ein TomTom-Key, der Tankerkönig-Key und die Kalender-Links stehen nie in der Datei und auch nicht in einer Sicherung.
Mit **Anpassen, Einstellungen sichern** bekommst du eine JSON-Datei, mit **Sicherung laden** holst du sie zurück, auch auf einem anderen Rechner. Das Cockpit erinnert dich, wenn die letzte Sicherung länger als zwei Wochen her ist.

## Kalender einrichten

Der Kalender liest öffentlich geteilte iCloud-Kalender. Apple schickt dabei keine CORS-Freigabe, ein Browser darf den Link also nicht direkt von einer Webseite laden. Dafür gibt es eine kleine Weiterleitung als Cloudflare Worker, kostenlos und in ein paar Minuten angelegt:

1. Auf dem iPhone in der Kalender-App unten auf „Kalender“, beim gewünschten Kalender auf (i), „Öffentlicher Kalender“ einschalten und den Link kopieren. Jeder mit diesem Link kann den Kalender lesen.
2. Auf dash.cloudflare.com unter „Workers & Pages“ einen Worker mit der Vorlage „Hello World“ anlegen, den Code durch `tools/kalender-worker.js` ersetzen und auf „Deploy“ klicken. Der Worker lässt nur iCloud-Adressen durch.
3. Im Cockpit im Kalender-Widget auf „Einrichten“, die Adresse des Workers und den Kalender-Link eintragen.

Die Termine samt Wiederholungen, Ausnahmen und Zeitzonen liest [ical.js](https://github.com/kewisch/ical.js) (MPL 2.0), das erst nachgeladen wird, wenn ein Kalender eingetragen ist.

## Aufbau

`index.html` ist die fertige Seite, die GitHub Pages ausliefert. Sie wird gebaut, deshalb nicht von Hand bearbeiten.

```
src/index.html      Grundgerüst mit Platzhaltern
src/html/           Himmel mit Uhr, Leiste, Raster (feste Widgets), Anpassen, Dialoge, Vorlagen, Spiegel
src/css/            Aussehen, nach Bereichen aufgeteilt
src/js/             Logik, ein Modul pro Thema (Zustand, Widgets, Seiten, Bearbeiten, ...)
build.mjs           baut aus src/ die index.html
tools/              Code für die Kalender-Weiterleitung (Cloudflare Worker)
```

Bauen (Node 18 oder neuer, keine Pakete nötig):

```
node build.mjs
```

Alle JS-Module landen in einem gemeinsamen Block und teilen sich ihren Gültigkeitsbereich. Die Reihenfolge ergibt sich aus der Nummer im Dateinamen.

## Versionen

**2.3** (Oktober 2026)
Neues Design: Oben steht ein Himmel über die ganze Breite, dessen Farben dem echten Sonnenstand an deinem Ort folgen, von Nacht mit Sternen über Morgenrot bis Abendrot, und bei Wolken oder Regen grauer werden. Darin eine große Uhr, Tag, Wetter, Tageslicht und der nächste Termin. Die Unterkante ist der Horizont, darüber zeigt ein Bogen die Sonnenhöhe des Tages mit Auf- und Untergang. Alles läuft lokal ohne Dienst und lässt sich unter Anpassen abschalten. Ruhigere Leiste für die Countdowns, Beschriftungen ohne Großbuchstaben, neue Farben für den dunklen Modus. Neue Widgets: Kalender (öffentlich geteilte iCloud-Kalender über eine eigene Weiterleitung, Wiederholungen, Ausnahmen, Ganztägiges, mehrere Kalender mit Farbe) und Vers des Tages (bolls.life, Luther 1912 oder fünf weitere Übersetzungen, Link zur Stelle auf bibleserver.com). Neuer Spiegel-Modus für einen Smart Mirror. Das Gleitzeit-Widget ist raus, die gestempelten Tage bleiben in den Daten und in der Sicherung.

**2.2** (Oktober 2026)
Neue Widgets: Fußball über OpenLigaDB (1., 2. oder 3. Liga, Lieblingsverein mit nächstem Spiel, Form und Live-Stand, Spieltag zum Durchblättern, Tabelle mit Zonen, Torjäger), Formel 1 über Jolpica (nächstes Rennen mit allen Sessions in deiner Ortszeit, WM-Stand Fahrer und Teams, letztes Rennen) und Spritpreise über Tankerkönig (eigener kostenloser Key, günstigste Tankstellen auf der Pendelstrecke, rund um Zuhause oder am Standort, mit Umweg und Preisänderung). Vereine, Fahrer und Teams lassen sich antippen und zeigen dann ein Infofenster mit Spielen, Ergebnissen und einer Kurzinfo aus Wikipedia. Nach dem Update gibt es einmal einen Hinweis mit Knopf, der eine Sport-Seite mit dem HSV einrichtet.

**2.1** (Oktober 2026)
Neue Widgets: Pomodoro (Timer mit Ton, Hinweis im Hintergrund, Aufgabe aus Todoist, Runden pro Tag), Gewohnheiten (Rhythmus täglich, werktags oder x pro Woche, Serie, die letzten drei Wochen zum Nachtragen), Lernfortschritt (Prüfungs-Countdown, Themenliste, Tempo-Prognose) und Gleitzeit (Kommen und Gehen, Soll, Saldo, gesetzliche Pause, Urlaub und Feiertage automatisch, Berufsschule, Krank, Gleittag; in 2.3 wieder entfernt). Aufgaben lassen sich direkt aus dem Cockpit in Todoist anlegen, mit Datum und Priorität wie in der App. Nach dem Update gibt es einmal einen Hinweis mit Knopf, der eine Fokus-Seite einrichtet.

**2.0** (Oktober 2026)
Seiten mit Tabs, Bearbeiten direkt auf dem Board, Widget-Galerie, Widgets mehrfach nutzbar (Aufgaben, Fortschritt, Schnellzugriff, Notizen), eigene Startseite oder automatisch nach Arbeitszeit, Erinnerung ans Sichern. Der Sonderweg für die Claude-Ansicht ist raus, die Seite läuft nur noch im Browser. Alte Einstellungen werden beim ersten Öffnen automatisch übernommen, der alte Stand bleibt zusätzlich unter `jere-cockpit-v1-vor-seiten` im Browser liegen.

**1.x** (bis Oktober 2026)
Eine Seite mit allen Widgets, Todoist über eigenen Token, Pendeln mit Autobahn-Meldungen, halbe Urlaubstage am 24.12. und 31.12., Urlaub bearbeiten, Anpassen-Leiste.
