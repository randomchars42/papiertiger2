# Anwendung benutzen

Papiertiger zeigt direkt den Text, der später ausgegeben wird. Zusätzliche
Modalfenster sind nicht erforderlich; Auswahl und Eingaben erscheinen am
betroffenen Eintrag.

## Dokument wählen

Die Auswahl **Dokument** bestimmt Reihenfolge und Art der dargestellten Blöcke.
Ein Dokument kann mehrere Textblöcke und andere Plug-ins wie CEDIS enthalten.
Die Blöcke teilen sich absichtlich den Textblock-Zustand, damit sie aufeinander
reagieren können.

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

**CEDIS PCL** zeigt im Dokument die Anzahl der aus den Symptomen abgeleiteten
Vorschläge beziehungsweise die bestätigte geordnete Auswahl. **Auswählen**
öffnet das Seitenwerkzeug. Dort können ausschließlich die vorgeschlagenen
PCL-Einträge übernommen, entfernt und mit Pfeiltasten geordnet werden. Ein
Vorschlag wird nie automatisch zur Auswahl.

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

Beim Eintrag **Symptom** öffnet **Symptom hinzufügen** eine kompakte
Inline-Zeile. Sie zeigt zuerst die von der globalen Linse kuratierten, häufigen
Werte in Quellreihenfolge. Das Feld **Nicht dabei? Symptom suchen oder frei
eingeben …** bildet die letzte Alternative. Mit dem ersten Suchzeichen ersetzt
die Suche die Vorauswahl und berücksichtigt den ganzen Katalog einschließlich
der Aliase. Passt kein Wert, kann der eingegebene Text ausdrücklich übernommen
werden;
für CEDIS wird dann lediglich **Unbekannt** vorgeschlagen.

Andere Katalogauswahlen wie **Allergie** folgen derselben Regel. Ein `*` am
Phrasentitel öffnet eine solche Auswahl wie bisher automatisch. Die aktive
**Linse** wird global in der Kopfzeile gewählt. Definition und Standard stehen
in `documents.pt`; der URL-Parameter `lens` überschreibt den Standard,
beispielsweise `?lens=kernteam`.

Enthält eine gewöhnliche Auswahlliste einen frei ausfüllbaren Wert, zeigt sie
dessen Eingabefeld direkt neben den festen Werten, zum Beispiel
**Diagnose oder Zustand**. **Enter** oder **Übernehmen** wählt den frei
eingegebenen Wert; ein fester Wert bleibt weiterhin mit einem Klick wählbar.

## Inline-Eingaben

Attribute wie Seite, Zahl, Zeitraum, Datum oder Freitext werden innerhalb des
Textes bearbeitet. Beim Öffnen ersetzt der Editor genau den angeklickten
Platzhalter; die umgebenden Wörter der Phrase bleiben stehen. Breitere
Auswahl- und Zeitraumeingaben dürfen dabei innerhalb der Phrase umbrechen.
Erforderliche Felder öffnen sich der Reihe nach. Zum Beispiel führt eine neue
Blutung zuerst durch Lokalisation und danach durch Seite.

Auf Geräten mit Maus und Tastatur wird ein neu geöffnetes Text- oder Zahlenfeld
fokussiert. Auf Touchgeräten bleibt es zunächst unfokussiert, damit die
Bildschirmtastatur nicht ungefragt das Layout verschiebt. Beim ersten Fokus ist
ein bereits vorhandener Wert vollständig ausgewählt, sodass die nächste
Tastatureingabe ihn ersetzt.

In einem einzeiligen Text-, Zahlen-, Datums- oder Zeitfeld übernimmt **Enter**
den aktuellen Wert und schließt den Editor. Dies entspricht **Fertig**; bei
sequenziellen Pflichtangaben kann dadurch direkt der nächste Editor geöffnet
werden. Ein Klick außerhalb der geöffneten Phrase und ihres Editors schließt
die Bearbeitung ebenfalls; das angeklickte Bedienelement wird anschließend
normal ausgeführt.

**Leeren** entfernt den Attributwert. Wird ein erforderliches Feld geleert oder
leer mit **Fertig** abgeschlossen, bleibt die unvollständige Phrase außerhalb
der Ausgabe.

## Automatisches Kompaktwerden konfigurieren

`autoCompactSeconds` in `app/ts/config.ts` bestimmt die Inaktivitätsfrist der
mit `@autocompact` markierten Gruppen. Die Voreinstellung beträgt 12 Sekunden.
`0` schaltet die Automatik aus; ein gleichnamiger URL-Parameter überschreibt
die lokale Konfiguration, beispielsweise `?autoCompactSeconds=20` oder
`?autoCompactSeconds=0`.

Die Frist gehört einer ganzen markierten Gruppe einschließlich ihrer
Untergruppen. Bedienung an beliebiger Stelle in diesem Teilbaum startet sie
neu. Zeiger- und Fokusaktivität pausieren sie; ein offener Inline-Editor hält
die Gruppe offen. Nach **Fertig** oder **Enter** beginnt die Frist erneut.
Gruppen außerhalb einer solchen Grenze beginnen erweitert. Eine
`@autocompact`-Grenze und ihr Teilbaum beginnen kompakt, sofern kein
Offenlegungsereignis den benötigten Pfad vorübergehend öffnet.

Kompakte Gruppen zeigen als Minimum nur aufgenommene Einträge, bedingt
sichtbare sowie vorgeschlagene oder erforderliche Phrasen, gegenwärtig bedingt
sichtbare Gruppen und die dafür nötigen Gruppenüberschriften. Die Überschrift
der kompakten Grenze selbst bleibt immer
sichtbar, damit sie über **…** wieder geöffnet werden kann.
Offene Aufmerksamkeit macht ihre Überschriften dabei nicht aktiv. Inaktive Überschriften
tragen eine Linie in ihrer abgeschwächten Farbe; erst die kräftige Schrift und
die Linie in der aktiven semantischen Farbe bedeuten zusammen mit dem
umrandeten Eintrag, dass tatsächlich etwas in die Ausgabe aufgenommen ist. Die
Reihenfolge bleibt auch im Minimum dieselbe wie in der Definition. Untergruppen,
die über `@subgroups(flow)` angeordnet sind, bilden unabhängig davon ein
zeitgeberfreies Akkordeon: Beim Öffnen wird ein offenes Geschwister kompakt.
Expansion und Kompaktierung werden bewusst langsam genug animiert, um die
Layoutänderung zu erklären; bei systemweit reduzierter Bewegung entfällt die
Animation.

Ein Klick auf eine Gruppenüberschrift schaltet den Einschluss der Gruppe ein
oder aus, ohne die Auswahl ihrer Kinder zu löschen. Deaktivieren kompaktiert die
Gruppe zugleich; Aktivieren öffnet den dafür nötigen Pfad. **…** öffnet
ausschließlich die Darstellung. Jede andere Bedienung eines sichtbaren Elements
im Minimum öffnet zuerst die zugehörige `@autocompact`-Grenze und führt danach
die gewählte Aktion aus. Deshalb erscheinen dort keine zusätzlichen
Disclosure-Symbole für die dargestellten Untergruppen. Einzige Ausnahme ist die
Überschrift der kompakten Grenze selbst: Ihr Klick deaktiviert und kompaktiert
sie unmittelbar. Im erweiterten Zustand ersetzt **≪** das **…** am Ende
derselben Inhaltszeile. **+** ist allein dem Anlegen einer weiteren Instanz
vorbehalten, **×** entfernt eine solche Instanz. Nur erweiterte Blöcke der
ersten Ebene schreiben **↺ Zurücksetzen** aus; verschachtelte Gruppen verwenden
das zugänglich beschriftete Symbol **↺**. Wird in einer nur zur Ansicht
geöffneten inaktiven Gruppe ein Kind ausdrücklich ausgewählt oder bearbeitet,
aktiviert diese Bedienung den Gruppenpfad mit.

## Bedingungen, Aufmerksamkeit und Vorgaben

Eine Auswahl kann eine bislang verborgene bedingte Phrase einblenden, eine
ohnehin verfügbare Phrase vorschlagen oder sie als erforderlich markieren.
Keine dieser Stufen nimmt den Eintrag automatisch in die Ausgabe auf.
Vorgeschlagene Phrasen besitzen eine gestrichelte Markierung; erforderliche
Phrasen sind stärker umrandet und tragen `(!)`. Die normalen semantischen
Farben für Normalbefund, Auffälligkeit, Intervention und neutrale Angaben
bleiben davon unabhängig.

Eine neu entstandene Aufmerksamkeitsstufe öffnet ihren Gruppenpfad und hält ihn
bis zur ersten Bedienung dort offen. Danach gelten wieder die normalen
Akkordeon- und Inaktivitätsregeln; die unerledigte Phrase bleibt im kompakten
Minimum sichtbar. **Weglassen** verwirft einen Vorschlag. Eine erforderliche
Phrase bleibt dagegen unerledigt, bis ihr erwarteter Wert vollständig
aufgenommen wurde. Eine fachlich zulässige Nichterhebung muss daher als eigener
Wert auswählbar sein.

Autoren können eine reine vorübergehende Offenlegung mit `@reveal(...)` an der
Zielgruppe auslösen. `@reveal(initial)` hält eine Gruppe stattdessen von Beginn
an bis zur ersten Bedienung offen. Werden gleichzeitig mehrere Geschwister
offengelegt, dürfen sie während dieser Aufmerksamkeitsspanne ausnahmsweise
nebeneinander offen sein. Verschwindet die auslösende Bedingung schon vor einer
Bedienung, kehrt der Pfad in seinen vorherigen kompakten Zustand zurück.

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
Textausgabe. Offene bedingte, vorgeschlagene und erforderliche Phrasen bleiben
sichtbar, werden aber nicht mitkopiert.
