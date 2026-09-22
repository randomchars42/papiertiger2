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
Das bloße Öffnen verändert den Dokumenttext nicht; eine ausdrücklich
bezeichnete Übernahmeaktion kann aktive Einträge setzen.

**Neuigkeiten** zeigt mit der Anwendung ausgelieferte Hinweise. Nur der
Gelesen-Status wird lokal im Browser gespeichert; klinischer Dokumentzustand
bleibt davon getrennt.

Eine Gruppe mit Rechner besitzt eine Schaltfläche wie **GCS berechnen** oder
**APGAR berechnen**. Nach vollständiger Auswahl setzt **In Textbaustein
übernehmen** Kriterien und Summe unmittelbar als aktive Einträge im
zugehörigen Textbaustein. Eine bestehende Auswahl dieser Einträge wird dabei
durch die ausdrücklich übernommene Rechnerauswahl ersetzt.

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

In einem einzeiligen Text-, Zahlen-, Datums- oder Zeitfeld übernimmt **Enter**
den aktuellen Wert und schließt den Editor. Dies entspricht **Fertig**; bei
sequenziellen Pflichtangaben kann dadurch direkt der nächste Editor geöffnet
werden.

**Leeren** entfernt den Attributwert. Wird ein erforderliches Feld geleert oder
leer mit **Fertig** abgeschlossen, bleibt die unvollständige Phrase außerhalb
der Ausgabe.

## Automatisches Einklappen konfigurieren

`autoCollapseSeconds` in `app/ts/config.ts` aktiviert das automatische
Einklappen für alle Gruppen. `0` lässt diese globale Option aus; positive Werte
geben die Wartezeit in Sekunden an. Ein gleichnamiger URL-Parameter
überschreibt die lokale Umgebungskonfiguration, beispielsweise
`?autoCollapseSeconds=4`. Explizit mit `@autocollapse` markierte Gruppen
behalten bei ausgeschalteter globaler Option ihr eigenes Verhalten. Automatisch
eingeklappte Gruppen zeigen ihre aktiven Einträge weiterhin in einer reduzierten
Ansicht; nur noch nicht aufgenommene Auswahlmöglichkeiten werden verborgen. Jede
weitere Bedienung innerhalb der Gruppe oder einer Untergruppe setzt deren
bereits laufende Fristen zurück, startet aber nicht allein durch die
Verschachtelung neue Fristen für sämtliche Obergruppen. Solange ein
Inline-Editor geöffnet ist, bleiben die betroffene Gruppe und ihre bereits
herunterzählenden Obergruppen offen; nach **Fertig** oder **Enter** beginnt die
jeweilige Frist neu.

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
