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

Zur Laufzeit ist die Anwendung statisch und frameworkfrei. Alle Pakete werden
über `fetch` geladen; es gibt keine Server-API und keine externe Bibliothek.

Die Laufzeitkonfiguration wird in `app/ts/config.ts` je Umgebung gesetzt. Beim
Start übernimmt `initialiseConfig()` gleichnamige URL-Parameter mit passendem
Grundtyp als letzte Konfigurationsschicht. So kann beispielsweise
`autoCollapseSeconds` lokal vorbelegt und für einen konkreten Aufruf per URL
überschrieben werden.

## Komponenten

```text
app/ts/app.ts
    Dokumentkatalog, Dokumentwechsel, blockweise Ausgabe

app/ts/lib/plugin.ts
    Laden und einheitliche Schnittstelle der Plug-ins

app/ts/plugins/textblock/
    Paketladen, Zustandsänderungen, Auflösung, Inline-Editoren, Ausgabe

app/ts/plugins/cedis/
    Suche und Auswahl im separaten CEDIS-Terminologiekatalog

app/ts/plugins/score/
    additive Rechner aus kompilierten Textblock-Metadaten

app/ts/plugins/updates/
    gebündelte Anwendungshinweise und lokaler Gelesen-Status

scripts/compile_textblocks.py
    Parser, ID-Ableitung, Referenzauflösung, Validierung, atomare Ausgabe
```

`documents.json` ist der einzige Katalog der sichtbaren Dokumente. Jeder Block
nennt ein Plug-in und dessen Parameter. Dadurch kann ein Dokument Textblöcke
und andere Module kombinieren, ohne ihre Implementierungen miteinander zu
verschmelzen.

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
Block Vorschläge in einem anderen Block beeinflussen. Dokument- und Plug-in-
Reihenfolge bleiben trotzdem im Dokumentkatalog definiert.

## Zustandsmodell

Die Laufzeit hält voneinander getrennt:

| Zustand | Zweck |
|---|---|
| aktive Vorgaben | gemeinsam gesetzte Ausgangswerte |
| Phrasenüberschreibungen | manuell gewählter Wert und Aufnahme |
| Gruppenüberschreibungen | Aktivierung zunächst inaktiver Gruppen |
| Attribute | Editorwerte je Phrase |
| Gruppeninstanzen | Identität wiederholbarer Vorkommen |
| Instanzzustände | Werte und Attribute einer einzelnen Wiederholung |
| angenommene Herkunft | Provenienz eines aktiv übernommenen Werkzeugwerts |

Die Auflösung berechnet daraus für jede sichtbare Phrase Wert, Textteile,
semantischen Typ, Quelle, Provenienz und Vollständigkeit. Vorschläge verändern
diesen abgeleiteten Zustand, nicht automatisch die Benutzereingaben.

## Kodierung und strukturierte Ausgabe

Ein Wert kann optional einen SNOMED-CT-Code oder -Ausdruck und dessen explizite
menschenlesbare Bezeichnung tragen. Die strukturierte Ausgabe übernimmt diese
als `code` beziehungsweise `expression` und `display`. Die sichtbare deutsche
Formulierung bleibt davon getrennt. Unkodierte Werte sind zulässig.

Attribute werden mit Editor-ID und typisiertem Wert ausgegeben. Zeitspannen
speichern neben Anzahl und Einheit auch ihren Bezugszeitpunkt; Datum/Zeit speichert
lokale Eingabe, Zeitzone und aufgelösten Zeitpunkt. Damit bleiben spätere
Auswertungen möglich, ohne den fertigen Satz erneut parsen zu müssen.

## Build-Grenze

Der Compiler liest zunächst alle Quellen und löst Referenzen, Bedingungen,
Vorgaben und Importe auf. Erst nach erfolgreicher Prüfung ersetzt er die
Zieldateien. `--check` schreibt nichts und meldet veraltete JSON-Produkte.

`make build` führt Compiler und TypeScript-Build aus. `make check` prüft, dass
die JSON-Produkte aktuell sind, und führt die TypeScript-Typprüfung ohne Ausgabe
aus.
