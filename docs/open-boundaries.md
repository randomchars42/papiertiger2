# Offene Grenzen

Diese Seite hält Fragen fest, für die noch keine belastbare Projektregel oder
vollständige Implementierung besteht. Sie ist bewusst kurz und enthält keine
Roadmap-Zusage.

## Bedingungen über Attributwerte

Bedingungen reagieren derzeit auf ausgewählte Phrasenwerte. Sie können nicht
ausdrücken:

- `seite = links`;
- `NRS >= 5`;
- „Datum liegt mehr als zwei Tage zurück“.

Eine spätere Syntax muss typisiert sein und darf nicht vom fertig gerenderten
Text abhängen.

Additive Rechner umgehen diese Grenze nicht: Ihre Punktwerte gehören typisiert
zu ausgewählten Werten. Sie berechnen derzeit weder aus freien Zahlenattributen
noch aus Vergleichsbedingungen automatisch einen Score.

## Nicht additive oder kontextabhängige Scores

`@score` summiert genau einen Punktwert je vollständig ausgewähltem Kriterium.
Gewichtete Formeln, Altersvarianten, „nicht prüfbar“-Zustände und Scores aus
Vitalparametern benötigen vor einer Erweiterung eigene fachliche und technische
Regeln. Sie werden nicht aus sichtbarem Text abgeleitet.

## Zusammengesetzte SNOMED-CT-Ausdrücke

Ein Wert kann einen SNOMED-CT-Code oder einen vollständig angegebenen Ausdruck
tragen. Noch nicht festgelegt ist, wie Editoren wie Seite, Schweregrad oder
Zeitbezug sicher in einen postkoordinierten Ausdruck eingehen.

Bis dahin dürfen kodierte und unkodierte Phrasen gemischt werden. Der Compiler
erfindet keine Kodierung aus sichtbaren Wörtern oder Editorarten.

## Explizite ID-Ausnahmen

IDs werden vollständig abgeleitet. Bei einer Kollision muss zurzeit die
sichtbare Bezeichnung präzisiert werden. Eine optionale explizite ID-Syntax wäre
denkbar, würde aber zusätzliche Stabilitäts- und Migrationsregeln benötigen.

## Persistenz und Import vorhandener Dokumentation

Der Zustand lebt derzeit nur in der geöffneten Anwendung. Speicherung,
Wiederherstellung, Versionsmigration und das erneute Öffnen strukturierter
Ausgaben sind noch nicht spezifiziert.

## Komplexere Inline-Editoren

Auswahl, Text, Zahl, Dauer, Datum und Datum/Zeit sind vorhanden. Komplexe
mehrteilige Editoren bleiben inline zu erproben, besonders bei eingeblendeter
Tablet-Tastatur. Modale Dialoge sind kein vorgesehener Standardweg.

## Wiederholung

Eine wiederholbare Gruppe besitzt unabhängige Instanzen. Verschachtelte
wiederholbare Gruppen und automatische Erzeugung mehrerer Instanzen aus einer
anderen Auswahl sind noch nicht unterstützt.

## Fachliche Qualität der CEDIS-Zuordnungen

Der Symptomkatalog deckt jeden gebündelten CEDIS-PCL-Code mindestens einmal
ab. Diese Vollständigkeit ist technisch prüfbar; die klinische Qualität einer
Beziehung `equivalent`, `related`, `broader` oder `narrower` bleibt jedoch eine
redaktionelle Entscheidung. Zuordnungen werden ausdrücklich am Wert gepflegt
und nicht aus SNOMED CT hergeleitet.

Mehrdeutige Zuordnungen dürfen mehrere PCL-Einträge vorschlagen. Das
CEDIS-Werkzeug verlangt deshalb weiterhin eine explizite Auswahl und lässt die
Reihenfolge durch den Benutzer festlegen. Eine spätere automatische Priorität
bräuchte eine eigene fachliche Regel und wird nicht aus Quellreihenfolge oder
Kodierung abgeleitet.
