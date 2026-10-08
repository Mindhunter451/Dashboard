# Jeres Tagescockpit

Persönliches Dashboard mit eigenen Seiten für Übersicht, Arbeit und Privat. Drin sind Urlaubstage, Fortschrittsbalken, Wetter mit Regenradar, Pendeln mit Staus und Baustellen, Todoist-Aufgaben, Schnellzugriff und Notizen.

Live: https://mindhunter451.github.io/Dashboard/

## Bedienen

Oben wechselst du die Seiten, per Klick, mit den Tasten 1 bis 9 oder über die Adresse, zum Beispiel `…/Dashboard/#arbeit`.
Mit **Bearbeiten** legst du Seiten an, benennst sie um und sortierst sie. Auf jeder Karte kannst du dann verschieben, die Breite ändern, Einstellungen öffnen oder sie von der Seite nehmen. Über **Widget hinzufügen** legst du neue Widgets an oder holst vorhandene auf die Seite.
Unter **Anpassen** sind Design, Akzentfarbe, Kacheln, Countdowns, Bundesland, die Startseite und die Sicherung.

## Daten

Alles, was du einstellst, liegt nur im Browser (localStorage), getrennt für jede Adresse und jeden Browser. Der Todoist-Token und ein TomTom-Key stehen nie in der Datei und auch nicht in einer Sicherung.
Mit **Anpassen, Einstellungen sichern** bekommst du eine JSON-Datei, mit **Sicherung laden** holst du sie zurück, auch auf einem anderen Rechner. Das Cockpit erinnert dich, wenn die letzte Sicherung länger als zwei Wochen her ist.

## Aufbau

`index.html` ist die fertige Seite, die GitHub Pages ausliefert. Sie wird gebaut, deshalb nicht von Hand bearbeiten.

```
src/index.html      Grundgerüst mit Platzhaltern
src/html/           Kopfzeile, Raster (Pendeln, Wetter, Urlaub), Anpassen, Dialoge, Vorlagen
src/css/            Aussehen, nach Bereichen aufgeteilt
src/js/             Logik, ein Modul pro Thema (Zustand, Widgets, Seiten, Bearbeiten, ...)
build.mjs           baut aus src/ die index.html
```

Bauen (Node 18 oder neuer, keine Pakete nötig):

```
node build.mjs
```

Alle JS-Module landen in einem gemeinsamen Block und teilen sich ihren Gültigkeitsbereich. Die Reihenfolge ergibt sich aus der Nummer im Dateinamen.

## Versionen

**2.0** (Oktober 2026)
Seiten mit Tabs, Bearbeiten direkt auf dem Board, Widget-Galerie, Widgets mehrfach nutzbar (Aufgaben, Fortschritt, Schnellzugriff, Notizen), eigene Startseite oder automatisch nach Arbeitszeit, Erinnerung ans Sichern. Der Sonderweg für die Claude-Ansicht ist raus, die Seite läuft nur noch im Browser. Alte Einstellungen werden beim ersten Öffnen automatisch übernommen, der alte Stand bleibt zusätzlich unter `jere-cockpit-v1-vor-seiten` im Browser liegen.

**1.x** (bis Oktober 2026)
Eine Seite mit allen Widgets, Todoist über eigenen Token, Pendeln mit Autobahn-Meldungen, halbe Urlaubstage am 24.12. und 31.12., Urlaub bearbeiten, Anpassen-Leiste.
