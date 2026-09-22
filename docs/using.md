# Anwendung benutzen

Papiertiger zeigt direkt den Text, der später ausgegeben wird. Zusätzliche
Modalfenster sind nicht erforderlich; Auswahl und Eingaben erscheinen am
betroffenen Eintrag.

## Dokument wählen

Die Auswahl **Dokument** bestimmt Reihenfolge und Art der dargestellten Blöcke.
Ein Dokument kann mehrere Textblöcke und künftig auch andere Plug-ins wie CEDIS
enthalten. Die Blöcke teilen sich absichtlich den Textblock-Zustand, damit sie
aufeinander reagieren können.

Ein Dokumentwechsel baut die sichtbaren Blöcke neu auf. Der aktuelle Zustand
wird derzeit nicht dauerhaft gespeichert.

## Werkzeuge

Werkzeuge öffnen sich auf breiten Bildschirmen links neben dem Dokument. Bei
weniger Platz werden sie als schließbare Seitenfläche über den Inhalt gezogen.
Sie verändern den Dokumenttext nicht unmittelbar.

**Neuigkeiten** zeigt mit der Anwendung ausgelieferte Hinweise. Nur der
Gelesen-Status wird lokal im Browser gespeichert; klinischer Dokumentzustand
bleibt davon getrennt.

Eine Gruppe mit Rechner besitzt eine Schaltfläche wie **GCS berechnen** oder
**APGAR berechnen**. Nach vollständiger Auswahl übergibt **Als Vorschlag
übernehmen** Kriterien und Summe an den zugehörigen Textbaustein. Die
gestrichelten Vorschläge werden einzeln bestätigt und gelangen vorher weder in
Text- noch Datenausgabe.

## Einträge bedienen

Ein Eintrag besitzt einen semantischen Typ:

| Typ | Bedeutung |
|---|---|
| normal | unauffälliger oder erwarteter Befund |
| auffällig | auffälliger Befund oder relevante Abweichung |
| Intervention | Maßnahme oder Ergebnis einer Maßnahme |
| neutral | Kontext oder nicht bewertete Information |

Ein normaler Standardwert ist bereits in die Ausgabe aufgenommen. Ein blasser,
gestrichelter Eintrag ist nur vorgeschlagen beziehungsweise noch nicht
aufgenommen.

- Bei genau zwei Werten wechselt ein Klick unmittelbar zum anderen Wert.
- Bei mehr Werten erscheint die Auswahl direkt unter dem Eintrag.
- **Weglassen** entfernt den Eintrag aus der Ausgabe, ohne seine Definition zu
  verändern.
- **Zurücksetzen** entfernt Benutzereingriffe im betreffenden Gruppenbereich und
  stellt Standards und aktive Vorgaben wieder her.
- Ein vorgeschlagener Eintrag wird erst nach Bestätigung Bestandteil der
  Ausgabe.

## Inline-Eingaben

Attribute wie Seite, Zahl, Zeitraum, Datum oder Freitext werden innerhalb des
Textes bearbeitet. Erforderliche Felder öffnen sich der Reihe nach. Zum Beispiel
führt eine neue Blutung zuerst durch Lokalisation und danach durch Seite.

Auf Geräten mit Maus und Tastatur wird ein neu geöffnetes Text- oder Zahlenfeld
fokussiert. Auf Touchgeräten bleibt es zunächst unfokussiert, damit die
Bildschirmtastatur nicht ungefragt das Layout verschiebt.

**Leeren** entfernt den Attributwert. Wird ein erforderliches Feld geleert oder
leer mit **Fertig** abgeschlossen, bleibt die unvollständige Phrase außerhalb
der Ausgabe.

## Vorschläge und Vorgaben

Eine Auswahl kann weitere Einträge sichtbar machen. Diese Vorschläge sind
farblich entsprechend ihrem eigenen Typ markiert, aber abgeschwächt und noch
nicht in die Ausgabe aufgenommen.

Eine Vorgabe setzt mehrere Phrasen gemeinsam, zum Beispiel den Beispielsatz
„Pneumonie“. Anschließende manuelle Änderungen haben Vorrang. Herkunft,
ausgewählter Wert und Aufnahme in die Ausgabe bleiben intern getrennte
Zustände.

## Wiederholbare Gruppen

Wiederholbare Gruppen modellieren mehrere gleichartige Vorkommen, zum Beispiel
mehrere Blutungen. Jede Instanz besitzt eigene Werte und Attribute. Sie kann
unabhängig zurückgesetzt oder entfernt werden.

## Ausgabe

- **Dokument kopieren** kopiert den zusammengesetzten lesbaren Text.
- **Daten kopieren** kopiert die strukturierte Ausgabe der einzelnen Blöcke als
  JSON, einschließlich kodierbarer Informationen und Attributwerte.

Nur aufgenommene und vollständig ausgefüllte Einträge gelangen in die
Textausgabe. Vorschläge bleiben sichtbar, werden aber nicht mitkopiert.
