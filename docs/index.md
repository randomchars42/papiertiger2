# Dokumentation

Die Dokumentation hat zwei einfache Einstiege:

- **Anwendung und Definitionen** erklären die Arbeit mit Papiertiger aus Sicht
  der Person, die dokumentiert oder Inhalte pflegt.
- **Technische Referenz** erklärt Compiler, Laufzeitmodell und derzeit bewusst
  offene Grenzen.

## Anwendung und Definitionen

| Frage | Seite |
|---|---|
| Wie wähle ich Befunde, bearbeite Werte und erhalte die Ausgabe? | [Anwendung benutzen](using.md) |
| Wie ergänze ich eine Gruppe, Phrase, Vorgabe oder ein Dokument? | [Definitionen schreiben](authoring.md) |
| Welche Direktiven und Kurzzeichen kennt `.pt` genau? | [`.pt`-Referenz](textblock-format.md) |

Der Autorenablauf ist bewusst vom generierten JSON getrennt:

```text
.pt bearbeiten -> kompilieren -> prüfen -> Anwendung testen
```

## Technische Referenz

| Frage | Seite |
|---|---|
| Wie bewegen sich Definitionen und Zustand durch das System? | [Architektur](architecture.md) |
| Was ist noch nicht formalisiert oder implementiert? | [Offene Grenzen](open-boundaries.md) |
| Wie wird gebaut und gestartet? | [Projekt-README](../README.md) |

## Autorität

Für das aktuelle Verhalten gilt folgende Reihenfolge:

1. `.pt`-Quellen definieren die Inhalte;
2. diese Dokumentation beschreibt die beabsichtigten Regeln;
3. Compiler und TypeScript-Laufzeit implementieren und prüfen sie;
4. generierte JSON- und JavaScript-Dateien sind reproduzierbare Produkte, keine
   eigenständigen Entscheidungsquellen.

Wenn Dokumentation und Implementierung auseinanderlaufen, wird der Widerspruch
benannt und gemeinsam behoben. Eine noch offene Frage wird nicht still durch
eine vermeintlich naheliegende Regel ersetzt.
