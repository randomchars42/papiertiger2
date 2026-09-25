# Architektur

## Hauptfluss

Die Autoren- und Laufzeitgrenze liegt beim generierten JSON. Der Browser kennt
das `.pt`-Format nicht.

```text
.pt-Quellen
    -> Python-Compiler
        -> geprüfte JSON-Pakete
            -> rekursiver Browser-Loader
                -> Definitionen + gemeinsamer Zustand
                    -> Auflösung -> Darstellung -> Text/strukturierte Ausgabe
```

Der Build erzeugt zusätzlich JavaScript aus den TypeScript-Quellen:

```text
app/ts/ -> tsc -> app/js/
```

Jede kompilierte Gruppe besitzt genau eine geordnete `items`-Liste aus
Phrasen- und Gruppenreferenzen. Getrennte, parallel zu synchronisierende
`phrases`- oder `children`-Listen gehören nicht zum Laufzeitformat. Die
vollständige semantische Prüfung geschieht im Compiler; die Laufzeit prüft bei
statisch ausgelieferten Paketen nur Formatversion und oberste Struktur.

Zur Laufzeit ist die Anwendung statisch und frameworkfrei. Alle Pakete werden
über `fetch` geladen; es gibt keine Server-API und keine externe Bibliothek.

Die Laufzeitkonfiguration wird in `app/ts/config.ts` gesetzt. Beim Start
übernehmen gleichnamige URL-Parameter mit passendem Grundtyp die letzte
Konfigurationsschicht. So kann beispielsweise `autoCompactSeconds` lokal
vorbelegt und für einen konkreten Aufruf per URL überschrieben werden. Der
Zeitgeber gehört der nächstgelegenen
`@autocompact`-Grenze einschließlich ihres gesamten Teilbaums.

Offenlegung und Layout sind Definitionseigenschaften nicht gleichgesetzt:
Gruppen außerhalb einer `@autocompact`-Grenze starten erweitert; die Grenze und
ihr Teilbaum starten kompakt. `@reveal(...)` kann den nötigen Pfad temporär
öffnen;
`@subgroups(flow|break)` steuert nur die Anordnung direkter Gruppen-Kinder.
Ohne Annotation gilt `flow`; `break` wirkt genau eine Ebene. `flow` schließt
offene Geschwister als zeitgeberfreies Akkordeon. Die kompakte Darstellung
bildet effektiv aufgenommene Phrasen, offene Aufmerksamkeitsstufen, bedingt
sichtbare Gruppen und ihre Überschriftenpfade in stabiler Quellreihenfolge ab.
Die Überschrift der
Grenze selbst bleibt stets erreichbar. Ein Disclosure verändert nur
Offenlegung. Andere Aktionen aus dem Minimum öffnen zunächst ihre nächste
kompakte `@autocompact`-Grenze und laufen danach unverändert weiter; die
Grenzüberschrift selbst deaktiviert ohne vorherige Expansion. Ein gewöhnlicher
Überschriftenklick koppelt Aktivierung mit Öffnen beziehungsweise Deaktivierung
mit Kompaktierung.

## Komponenten

```text
app/ts/app.ts
    Dokumentkatalog, Dokumentwechsel, blockweise Ausgabe

app/ts/lib/plugin.ts
    Laden und einheitliche Schnittstelle der Plug-ins

app/ts/plugins/textblock/
    Paketladen, Zustandsänderungen, Auflösung, Inline-Editoren, Ausgabe

app/ts/plugins/cedis/
    geordnete Bestätigung der aus Textblöcken vorgeschlagenen CEDIS-Einträge

app/ts/plugins/score/
    additive Rechner aus kompilierten Textblock-Metadaten

app/ts/plugins/updates/
    gebündelte Anwendungshinweise und lokaler Gelesen-Status

scripts/compile_textblocks.py
    Parser, ID-Ableitung, Referenzauflösung, Validierung, atomare Ausgabe
```

`documents.json` ist der einzige Katalog der sichtbaren Dokumente, der globalen
Linsen und ihrer Autorengruppen. Linsengruppen werden beim Kompilieren von
`@active(...)` und `@lens=` vollständig in konkrete Linsen-IDs aufgelöst. Jeder
Block nennt ein Plug-in und dessen Parameter. Dadurch
kann ein Dokument Textblöcke und andere Module kombinieren, ohne ihre
Implementierungen miteinander zu verschmelzen. Katalogwerte und Gruppen
referenzieren Linsen-IDs, besitzen aber keine eigene Linsenregistrierung.

Globale Werkzeuge stehen im selben Katalog, aber getrennt von den
Dokumentblöcken. Die Anwendung besitzt eine gemeinsame responsive
Werkzeugfläche: links neben dem Dokument bei ausreichender Breite, andernfalls
als seitlich eingeblendete Fläche. Werkzeug-Plug-ins tragen nicht automatisch
zur Dokumentausgabe bei.

Textblöcke fordern ein kontextbezogenes Werkzeug über ein aufsteigendes
Anwendungsereignis an. Ein Rechner sendet sein Ergebnis als typisierte Nachricht
an die Anwendung zurück; diese leitet es an die sichtbaren Dokument-Plug-ins.
Das Textblock-Plug-in prüft Werte und Summe erneut gegen seine geladene
Definition, bevor es sie als aktive Benutzerauswahl mit Rechnerprovenienz
speichert.

## Textblock-Pakete

Ein Paket kann Gruppen, Phrasen, Vorgaben und Editoren definieren sowie andere
Pakete importieren. Der Loader verarbeitet Importe zuerst, erkennt Zyklen und
führt jede Paketdefinition nur einmal zusammen. IDs dürfen sich im gesamten
Definitionsgraphen nicht überschneiden.

Mehrere sichtbare Textblockmodule verwenden absichtlich dieselben geladenen
Definitionen und denselben Dokumentzustand. So kann ein gesetzter Wert in einem
Block bedingte Sichtbarkeit oder Aufmerksamkeit in einem anderen Block
beeinflussen. Dokument- und Plug-in-Reihenfolge bleiben trotzdem im
Dokumentkatalog definiert.

Große Wertkataloge werden vom Compiler vorab normalisiert und beim Laden in
eine kataloggestützte Phrase eingefügt. Suchtext und stabile IDs entstehen
beim Build; der Browser filtert nur noch fertige Zeichenketten und rendert
höchstens die erste Ergebnisgruppe. Kataloge ohne `@lens`-Zuordnungen zeigen
initial ihre Einträge in Quellreihenfolge. Bei Katalogen mit Zuordnungen
verändert die globale Linse nur die initial sichtbare Teilmenge, nicht Katalog,
Auswahl oder Ausgabe.
Eine nachgestellte Suche wechselt mit dem ersten Suchzeichen in einen eigenen
Ergebniszustand und durchsucht weiterhin den gesamten Katalog.

Paketlokale Katalog-Tags werden ebenfalls ausschließlich beim Build aufgelöst.
Eine Bedingungsabfrage wie `@tag(symptome.schmerz)` wird in die stabilen IDs der
gegenwärtig markierten Werte übersetzt. Die Laufzeitbedingungen bleiben dadurch
reine Wert-ID-Mengen und erhalten keine zweite Abfragesprache.

Aufgenommene Symptomwerte liefern ihre expliziten CEDIS-Zuordnungen als
Vorschläge an das CEDIS-Plug-in. Dieses hält eine eigene, vom Benutzer
bestätigte und geordnete Liste. Weder ein Symptom noch eine SNOMED-Kodierung
wählt automatisch einen PCL-Eintrag aus. Der Dokumentblock zeigt die knappe
Zusammenfassung, während das gleichnamige Werkzeug Auswahl und Reihenfolge
bearbeitet.

## Zustandsmodell

Die Laufzeit hält voneinander getrennt:

| Zustand | Zweck |
|---|---|
| aktive Vorgaben | gemeinsam gesetzte Ausgangswerte |
| Phrasenüberschreibungen | manuell gewählter Wert und Aufnahme |
| Gruppenüberschreibungen | aktueller Einschluss einer beliebigen Gruppe |
| Attribute | Editorwerte je Phrase |
| Gruppeninstanzen | Identität wiederholbarer Vorkommen |
| Instanzzustände | Werte und Attribute einer einzelnen Wiederholung |
| angenommene Herkunft | Provenienz eines aktiv übernommenen Werkzeugwerts |

Die Auflösung berechnet daraus für jede sichtbare Phrase Wert, Textteile,
semantischen Typ, Quelle, Provenienz, Vollständigkeit und die unabhängige
Aufmerksamkeitsstufe `none`, `conditional`, `suggested` oder `required`. Im
selben Durchlauf leitet sie für jede Gruppe linsen- beziehungsweise
benutzerabhängige Aktivierung, Bedingungsergebnis, effektive Aufnahme und die
stärkste offene Aufmerksamkeit ihrer Nachfahren ab. Darstellung und
Kompaktierung lesen diesen gemeinsamen Zustand,
statt den Gruppenbaum jeweils erneut zu durchsuchen. Gespeicherte Aufnahme und
effektive Aufnahme bleiben getrennt: Eine inaktive Vorfahrengruppe unterdrückt
letztere, ohne Kindzustand zu löschen. Nur effektive Aufnahme speist Ausgabe,
Bedingungen und aktive Darstellung. Bedingte Sichtbarkeit und Aufmerksamkeit
verändern diesen abgeleiteten Zustand, nicht automatisch die Benutzereingaben,
und aktivieren keine Vorfahrengruppe. Neu entstandene Aufmerksamkeitsstufen
sowie `@reveal(...)`- und
`@reveal(initial)`-Ereignisse erzeugen nur einen flüchtigen UI-Zustand: Der
Zielpfad bleibt bis zur ersten Bedienung erweitert. Dieser Zustand gehört weder
zum Dokument noch zur strukturierten Ausgabe.

## Kodierung und strukturierte Ausgabe

Ein Wert kann optional einen SNOMED-CT-Code oder -Ausdruck und dessen explizite
menschenlesbare Bezeichnung tragen. Die strukturierte Ausgabe übernimmt diese
als `code` beziehungsweise `expression` und `display`. Die sichtbare deutsche
Formulierung bleibt davon getrennt. Unkodierte Werte sind zulässig.

Attribute werden mit Editor-ID und typisiertem Wert ausgegeben. Zeitspannen
speichern neben Anzahl und Einheit auch ihren Bezugszeitpunkt; Datum/Zeit speichert
lokale Eingabe, Zeitzone und aufgelösten Zeitpunkt. Damit bleiben spätere
Auswertungen möglich, ohne den fertigen Satz erneut parsen zu müssen.

Die strukturierte Textblockausgabe besitzt Version `2`. Effektiv aufgenommene
Phrasen stehen unter `items`; noch offene bedingte, vorgeschlagene oder
erforderliche Phrasen stehen gemeinsam unter `pending` und tragen ihre
Aufmerksamkeitsstufe. Diese Trennung verhindert, dass reine Hinweise als
dokumentierte Befunde erscheinen.

## Build-Grenze

Der Compiler liest zunächst alle Quellen und löst Referenzen, Bedingungen,
Vorgaben und Importe auf. Erst nach erfolgreicher Prüfung ersetzt er die
Zieldateien. `--check` schreibt nichts und meldet veraltete JSON-Produkte.

`make build` führt Compiler und TypeScript-Build aus. `make check` prüft, dass
die JSON-Produkte aktuell sind, und führt die TypeScript-Typprüfung ohne Ausgabe
aus. `make test` baut zuerst und prüft anschließend die zentralen Regeln des
abgeleiteten Textblockzustands mit den integrierten Node.js-Tests.
