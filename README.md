# Papiertiger

Papiertiger ist eine kleine, frameworkfreie Webanwendung zur strukturierten
Dokumentation. Sie zeigt vorgegebene Textbausteine, normale Standardbefunde,
auffällige Werte, Maßnahmen und zunächst nur vorgeschlagene Einträge direkt in
der späteren Textausgabe.

Die Definitionen werden im kurzen, von Menschen editierbaren `.pt`-Format
geschrieben. Ein Python-Compiler erzeugt daraus die vom Browser geladenen
JSON-Pakete. Kodierungen wie SNOMED CT sind optional; unkodierte und kodierte
Einträge dürfen nebeneinander bestehen.

## Dokumentation

Wähle den Einstieg passend zur Aufgabe:

| Aufgabe | Einstieg |
|---|---|
| Einen Befund dokumentieren | [Anwendung benutzen](docs/using.md) |
| Textbausteine, Editoren oder Dokumente pflegen | [Definitionen schreiben](docs/authoring.md) |
| Syntax nachschlagen | [`.pt`-Referenz](docs/textblock-format.md) |
| Code und Datenfluss verstehen | [Architektur](docs/architecture.md) |
| Noch nicht festgelegte Grenzen prüfen | [Offene Grenzen](docs/open-boundaries.md) |

Die vollständige Navigation steht im [Dokumentationsindex](docs/index.md).

## Voraussetzungen

- Python 3;
- der TypeScript-Compiler `tsc` für den Build;
- ein moderner Browser.

Die ausgelieferte Webanwendung besitzt keine externen Laufzeitabhängigkeiten.
Sie benötigt weder Framework noch Paketmanager noch Serverlogik.

## Start

```bash
make build
make serve
```

Danach ist die Anwendung standardmäßig unter
`http://127.0.0.1:8000/` erreichbar.

## Definitionen bearbeiten

Bearbeitet werden ausschließlich die `.pt`-Quellen unter `app/data/`:

```bash
make compile
make check
```

`make compile` erzeugt die gleichnamigen JSON-Dateien. Diese sowie die Dateien
unter `app/js/` sind generiert und werden nicht von Hand geändert.

Der CEDIS-Katalog ist eine Ausnahme: `app/data/cedis.json` enthält einen
externen Terminologiedatenbestand und ist keine Papiertiger-Definition.

## Repository-Struktur

```text
app/
├── data/                 .pt-Quellen, generierte JSON-Pakete, CEDIS-Katalog
├── ts/                   TypeScript-Quellen
├── js/                   generiertes JavaScript
├── index.html
└── style.css
docs/                     Benutzer- und technische Dokumentation
scripts/
└── compile_textblocks.py .pt-Compiler
Makefile                  Build, Prüfung und lokaler Server
```

Vor dem Abschluss einer Änderung sollen `make check`, `make build` und
`git diff --check` erfolgreich sein. Geänderte Interaktionen werden zusätzlich
in einer Tabletbreite getestet.
