# Jeres Tagescockpit

Persönliches Dashboard mit eigenen Seiten, zum Beispiel für Übersicht, Arbeit, Privat, Fokus und Sport. Oben ein Himmel, der dem echten Sonnenstand folgt, mit großer Uhr und Sonnenbogen. Drin sind Urlaubstage, Fortschrittsbalken, Wetter mit Regenradar, Pendeln mit Staus und Baustellen, Todoist-Aufgaben, iCloud-Kalender, Abfahrten von Bus und Bahn, Geburtstage, Müllabfuhr, Vers des Tages, Schnellzugriff, Notizen, Pomodoro, Gewohnheiten, Lernfortschritt, Fußball, Formel 1 und Spritpreise. Dazu ein schwarzer Spiegel-Modus für einen Smart Mirror. Das Cockpit lässt sich als App installieren und startet auch ohne Netz.

Live: https://mindhunter451.github.io/Dashboard/

## Bedienen

Oben wechselst du die Seiten, per Klick, mit den Tasten 1 bis 9 oder über die Adresse, zum Beispiel `…/Dashboard/#arbeit`.
Ein Tipp auf den Titel einer Karte klappt sie ein. Dann bleibt nur der Kopf mit dem Wichtigsten stehen, zum Beispiel die nächste Abfahrt oder der nächste Termin. Welche Karten zu sind, merkt sich jedes Gerät selbst. Beim Scrollen erscheint oben eine schmale Leiste mit Uhrzeit und Seiten.
Mit **Bearbeiten** legst du Seiten an, benennst sie um und sortierst sie. Auf jeder Karte kannst du dann verschieben, die Breite ändern, Einstellungen öffnen oder sie von der Seite nehmen. Über **Widget hinzufügen** legst du neue Widgets an oder holst vorhandene auf die Seite.
Unter **Anpassen** sind Design, Akzentfarbe, Himmel an oder aus, Kacheln, Countdowns, Bundesland, die Startseite und die Sicherung.
**Spiegel** (oder die Taste S) zeigt Uhr, Wetter, Termine, Abfahrten, Geburtstage, Müllabfuhr, Countdowns und den Vers auf Schwarz, im Vollbild. Mit `…/Dashboard/#spiegel` startet die Seite direkt so, praktisch für einen Kiosk-Browser am Smart Mirror. Raus geht es mit Esc.

## Als App installieren

In Chrome und Edge über „App installieren“ im Browser-Menü oder unter **Anpassen, Als App**. Auf iPhone und iPad in Safari über Teilen und „Zum Home-Bildschirm“, am Mac in Safari über Ablage und „Zum Dock hinzufügen“. Die App startet ohne Browserleiste und öffnet auch ohne Netz, das Wetter zeigt dann den letzten Stand. Updates kommen von selbst, weil der Service Worker die Seite immer zuerst frisch aus dem Netz holt.
Auf iPhone und iPad hat die App vom Home-Bildschirm ihren eigenen Speicher. Die Einstellungen holst du über eine Sicherung rüber, Token, Keys und Kalender-Links trägst du dort einmal neu ein.

## Daten

Alles, was du einstellst, liegt nur im Browser (localStorage), getrennt für jede Adresse und jeden Browser. Der Todoist-Token, ein TomTom-Key, der Tankerkönig-Key und die Kalender-Links stehen nie in der Datei und auch nicht in einer Sicherung.
Mit **Anpassen, Einstellungen sichern** bekommst du eine JSON-Datei, mit **Sicherung laden** holst du sie zurück, auch auf einem anderen Rechner. Das Cockpit erinnert dich, wenn die letzte Sicherung länger als zwei Wochen her ist.

## Kalender einrichten

Der Kalender liest öffentlich geteilte iCloud-Kalender. Apple schickt dabei keine CORS-Freigabe, ein Browser darf den Link also nicht direkt von einer Webseite laden. Dafür gibt es eine kleine Weiterleitung als Cloudflare Worker, kostenlos und in ein paar Minuten angelegt:

1. Auf dem iPhone in der Kalender-App unten auf „Kalender“, beim gewünschten Kalender auf (i), „Öffentlicher Kalender“ einschalten und den Link kopieren. Jeder mit diesem Link kann den Kalender lesen.
2. Auf dash.cloudflare.com unter „Workers & Pages“ einen Worker mit der Vorlage „Hello World“ anlegen, den Code durch `tools/kalender-worker.js` ersetzen und auf „Deploy“ klicken. Der Worker lässt nur iCloud-Adressen durch.
3. Im Cockpit im Kalender-Widget auf „Einrichten“, die Adresse des Workers und den Kalender-Link eintragen.

Die Termine samt Wiederholungen, Ausnahmen und Zeitzonen liest [ical.js](https://github.com/kewisch/ical.js) (MPL 2.0), das erst nachgeladen wird, wenn ein Kalender eingetragen ist.

## Abfahrten, Geburtstage, Müllabfuhr

Die Abfahrten kommen von [Transitous](https://transitous.org), einer freien, nicht kommerziellen Fahrplanauskunft mit offenen Daten (für Deutschland DELFI, Echtzeit dort, wo die Verkehrsbetriebe sie liefern). Ohne Key, das Cockpit fragt höchstens einmal pro Minute und nur, wenn die Karte zu sehen ist. Die Quellen sind in der Karte verlinkt, wie Transitous es verlangt. Pro Widget eine Haltestelle, mit Filter für Verkehrsmittel, Linien und Richtung. Mit dem Fußweg zur Haltestelle zeigt die Karte, wann du los musst.
Geburtstage trägst du selbst ein oder übernimmst sie als vCard-Datei aus den Kontakten (iPhone: Kontakte, Listen, „Alle Kontakte“ gedrückt halten, Exportieren). Ganztägige Termine mit „Geburtstag“ im Titel aus dem Kalender-Widget kommen dazu.
Für die Müllabfuhr lädst du die ICS-Datei deines Entsorgers oder trägst pro Tonne einen Rhythmus ein. Am Vorabend erinnert das Cockpit ab einer Uhrzeit deiner Wahl, auf Wunsch auch als Mitteilung, solange es offen ist. Geburtstage und Abfuhrtermine stehen in der Sicherung.

## Aufbau

`index.html` ist die fertige Seite, die GitHub Pages ausliefert. Sie wird gebaut, deshalb nicht von Hand bearbeiten.

```
src/index.html      Grundgerüst mit Platzhaltern
src/html/           Himmel mit Uhr, Leiste, Raster (feste Widgets), Anpassen, Dialoge, Vorlagen, Spiegel
src/css/            Aussehen, nach Bereichen aufgeteilt
src/js/             Logik, ein Modul pro Thema (Zustand, Widgets, Seiten, Bearbeiten, ...)
src/pwa/            Manifest und Service Worker für die Installation als App
build.mjs           baut aus src/ die index.html, sw.js und manifest.webmanifest
icons/              App-Icons
tools/              Code für die Kalender-Weiterleitung (Cloudflare Worker)
```

Bauen (Node 18 oder neuer, keine Pakete nötig):

```
node build.mjs
```

Alle JS-Module landen in einem gemeinsamen Block und teilen sich ihren Gültigkeitsbereich. Die Reihenfolge ergibt sich aus der Nummer im Dateinamen.

## Versionen

**2.5** (Oktober 2026)
Feinschliff am Design: Jede Karte hat jetzt denselben Kopf mit Symbol, Titel und Status links und den Knöpfen rechts, als ruhige Symbole statt Text. Wetter, Abfahrten, Kalender und Pendeln schweben etwas höher, Schnellzugriff, Notizen und Vers liegen flacher. Die Akzentfarbe gibt es nur noch für jetzt, heute und Aktionen, der Rest ist ruhiger. Karten lassen sich per Tipp auf den Titel einklappen und zeigen dann eine Kurzinfo. Beim Scrollen bleibt oben eine schmale Leiste mit Uhrzeit und Seiten. Statt „wird geladen“ zeigen die Karten graue Platzhalter, beim Seitenwechsel kommen die Karten kurz nacheinander rein. Einrichten-Hinweise sind kompakt, Todoist zeigt ohne Token nur noch eine Zeile. Auf dem Handy ist das Regenradar erst zu und Kalender und Geburtstage zeigen weniger, die Übersicht ist dadurch rund ein Fünftel kürzer. Der nächste Termin von heute bekommt ein „in 19 Min“, die Farbe vom Horizont schimmert unter dem Himmel nach, der dunkle Modus hat etwas mehr Kontrast.

**2.4** (Oktober 2026)
Neue Widgets: Abfahrten über Transitous (Haltestelle suchen oder in der Nähe finden, live mit Verspätung, Gleiswechsel, Ausfällen und Hinweisen der Verkehrsbetriebe, Filter für Verkehrsmittel, Linien und Richtung, „Los in 3 Min“ mit deinem Fußweg, gerne mehrfach für mehrere Haltestellen), Geburtstage (selbst eintragen oder als vCard aus den Kontakten übernehmen, mit Alter, Countdown und Geburtstagen aus dem Kalender) und Müllabfuhr (ICS-Datei vom Entsorger oder eigener Rhythmus, Farbe pro Tonne, Erinnerung am Vorabend). Der Spiegel zeigt jetzt auch Abfahrten, Geburtstage und Abholtermine. Das Cockpit lässt sich als App installieren, mit eigenem Icon, und startet auch ohne Netz.

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
