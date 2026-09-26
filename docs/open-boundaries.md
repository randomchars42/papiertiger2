# Offene Grenzen

Diese Seite hält Fragen fest, für die noch keine belastbare Projektregel oder
vollständige Implementierung besteht. Sie ist bewusst kurz und enthält keine
Roadmap-Zusage.

## Laufzeitkonfiguration und Internationalisierung

Die gegenwärtige Laufzeitkonfiguration umfasst nur Daten- und Plug-in-Pfad,
Autokompaktierungsfrist und eine optionale Linsenwahl. Die Standardlinse steht
im Dokumentkatalog; der URL-Parameter `lens` kann sie überschreiben.

Noch offen ist, ob eine spätere Anwendung Varianten für Sprache, Protokolltiefe
oder einen allgemeinen Basis-Pfad benötigt. Die früheren, ungenutzten Schlüssel
`language`, `logLevel`, `baseURL` und `languageURL` legen dafür keine Semantik
fest und wurden entfernt. Vor einer Wiedereinführung müssen Quelle, Gültigkeit
und das Verhalten bei einem URL-Override definiert werden.

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

## Gruppenweite Aufmerksamkeit

Gruppen unterstützen `condition(...)`, aber keine eigenen Modi `suggest(...)`
oder `require(...)`. Für solche Gruppenmodi fehlt ein eindeutiges
Erledigungskriterium:

- irgendein vollständig aufgenommener Nachfahre;
- alle gegenwärtig sichtbaren Nachfahren;
- eine ausdrücklich definierte Zielmenge.

Diese Varianten sind fachlich nicht gleichwertig. Bis ein konkreter Bedarf das
Kriterium festlegt, sitzt Aufmerksamkeit daher an den zu erledigenden Phrasen.
`@reveal(...)` übernimmt eine rein darstellerische Gruppenoffenlegung.

## Komplexe oder aus externen Werten berechnete Scores

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
