# Sichtbarkeit und Kompaktierung

Dieses Dokument ist die zentrale, normative Beschreibung für Sichtbarkeit,
Einschluss, Offenlegung und Kompaktierung im Textblock-Plug-in. Die
[`.pt`-Referenz](textblock-format.md), die
[Autorenhilfe](authoring.md), die [Benutzerhilfe](using.md) und die
[Architektur](architecture.md) verweisen auf diese Regeln, statt eigene
Varianten davon festzulegen.

## Getrennte Zustände

Fünf Zustände dürfen nicht miteinander gleichgesetzt werden:

| Zustand | Bedeutung | Verändert die Ausgabe? |
|---|---|---|
| anwendbar | Gruppe gehört zur aktiven Linse | kann Darstellung und Einschluss verhindern |
| Bedingung erfüllt | referenzierter Wert ist effektiv aufgenommen | kann Sichtbarkeit verhindern |
| aktiv | Gruppe lässt den effektiven Einschluss ihrer Kinder zu | ja |
| sichtbar | Element wird gegenwärtig dargestellt | nein |
| erweitert | zusätzliche Bedienelemente und inaktive Alternativen sind offengelegt | nein |

Daraus folgen diese Grundregeln:

- Nur effektiver Einschluss erzeugt aktive Gestaltung und Textausgabe.
- Sichtbarkeit, Vorschlag oder Offenlegung aktiviert weder ein Element noch
  seine Vorfahren.
- Kompaktieren löscht keine Auswahl, Attribute oder Wiederholungsinstanzen.
- Eine inaktive Vorfahrengruppe unterdrückt den effektiven Einschluss ihrer
  Nachfahren, bewahrt aber deren Zustand.

## Anwendbarkeit und Aktivität

Die Regeln werden in dieser Reihenfolge angewandt:

1. `@lens(...)` bestimmt die strukturelle Anwendbarkeit. Außerhalb der
   genannten Linse fehlt die Gruppe einschließlich ihrer Überschrift.
2. `condition(...)` bestimmt die bedingte Sichtbarkeit. Eine bedingte Gruppe
   fehlt, solange ihre Bedingung nicht erfüllt ist.
3. `@inactive` oder `@active(...)` bestimmt den anfänglichen aktiven Zustand
   einer anwendbaren Gruppe. Ohne diese Annotation beginnt sie aktiv.
4. Eine ausdrückliche Benutzerentscheidung überschreibt den Anfangszustand und
   bleibt bei einem Linsenwechsel erhalten. Zurücksetzen entfernt diesen
   Vorrang.

Für eine sonst sichtbare, aber inaktive Gruppe gilt:

- Nur ihre eigene Überschrift bleibt sichtbar.
- Ihre Kinder, Bedingungen, Aufmerksamkeitshinweise und Offenlegungen sind
  unwirksam.
- Ein Klick auf die Überschrift aktiviert sie und öffnet den nötigen Pfad.
- Erneutes Klicken deaktiviert und kompaktiert sie, ohne Kindzustand zu löschen.

`@inactive` und `@active(...)` schließen einander aus. In `@active(...)`
genannte Linsen müssen außerdem in `@lens(...)` enthalten sein, falls beide
Annotationen vorkommen.

## Bedingungen und Aufmerksamkeit

Phrasen und Gruppen verwenden dieselbe Bedingungsform:

```pt
P condition(kritischer_befund): Rücksprache empfohlen|-
G condition(kritischer_befund): Hinweise
```

Gruppen unterstützen nur `condition(...)`. `suggest(...)` und `require(...)`
bleiben Phrasenmodi, weil Gruppen kein eindeutiges Erledigungskriterium besitzen.

Mehrere alternative Referenzen werden mit `;` getrennt. `/` bleibt
ausschließlich den auswählbaren Werten rechts von `=>` vorbehalten.

Die Phrasenmodi unterscheiden sich nur in Sichtbarkeit und Aufmerksamkeit:

| Modus | Bedingung falsch | Bedingung wahr |
|---|---|---|
| `condition(...)` | Phrase verborgen | Phrase sichtbar, aber nicht aufgenommen |
| `suggest(...)` | Phrase gewöhnlich verfügbar | zusätzlich als Vorschlag markiert |
| `require(...)` | Phrase gewöhnlich verfügbar | stärker markiert und mit `(!)` erforderlich |

Zusätzlich gilt:

- Kein Modus nimmt einen Wert automatisch in die Ausgabe auf.
- Vorschläge und Anforderungen aktivieren oder markieren ihre Vorfahren nicht
  als aufgenommen.
- Eine neue offene Aufmerksamkeit erweitert den nötigen Gruppenpfad und hält
  ihn bis zur ersten Bedienung in diesem Pfad offen.
- Danach gelten wieder Akkordeon und `@autocompact`; die unerledigte Phrase
  bleibt im kompakten Minimum sichtbar.
- **Weglassen** erledigt einen Vorschlag, aber keine Anforderung.

## Anfangszustand und kompaktes Minimum

- Gruppen außerhalb einer `@autocompact`-Grenze beginnen erweitert.
- Eine `@autocompact`-Grenze und ihr gesamter Teilbaum beginnen kompakt.
- `@reveal(initial)` verschiebt diesen kompakten Anfang bis zur ersten
  Bedienung im offengehaltenen Pfad.
- Eine neue Wiederholungsinstanz wird als direkte Benutzeraktion geöffnet.

Im kompakten Zustand bleiben ausschließlich sichtbar:

- effektiv aufgenommene Phrasen;
- Phrasen mit offener bedingter, vorgeschlagener oder erforderlicher
  Aufmerksamkeit;
- gegenwärtig bedingt sichtbare Gruppen;
- die Gruppenüberschriften auf den Pfaden zu diesen Elementen;
- die Überschrift der `@autocompact`-Grenze selbst.

Die Quellreihenfolge bleibt stabil. Es gibt keine Sortierung aktiver Elemente
an den Anfang. Nur Gruppen mit effektiv aufgenommenen Nachfahren erhalten die
aktive Überschriftengestaltung. Aufmerksamkeit allein genügt dafür nicht.

## Offenlegung und Halten

Folgende Ereignisse erweitern einen Pfad, ohne seinen Einschluss zu ändern:

- **…** als ausdrückliche Offenlegung;
- eine neu erfüllte `@reveal(...)`-Bedingung;
- `@reveal(initial)` beim ersten Rendern;
- eine neu entstandene vorgeschlagene oder erforderliche Aufmerksamkeit;
- das Anlegen einer Wiederholungsinstanz.

Für bedingte Offenlegung und Aufmerksamkeit gilt:

- Der Pfad bleibt bis zur ersten Bedienung darin offen.
- Mehrere gleichzeitig offengehaltene Geschwister dürfen nebeneinander offen
  bleiben.
- Fällt der Auslöser vorher weg, kehrt der Pfad in seinen vorherigen kompakten
  Zustand zurück.
- Eine später erneut erfüllte Bedingung kann erneut offenlegen.

**…** wird im erweiterten Zustand durch **≪** am Ende derselben Inhaltszeile
ersetzt. Beide verändern nur die Darstellung.

## Bedienung

- Ein Überschriftenklick schaltet ausschließlich die Aktivität der Gruppe:
  Aktivieren öffnet den nötigen Pfad, Deaktivieren kompaktiert ihn.
- Die Überschrift einer kompakten `@autocompact`-Grenze erweitert nicht zuerst,
  sondern deaktiviert und kompaktiert unmittelbar.
- Die Bedienung jedes anderen sichtbaren Elements im kompakten Minimum öffnet
  zuerst die nächste `@autocompact`-Grenze und führt dann die ursprüngliche
  Aktion aus.
- **+** legt ausschließlich eine Wiederholungsinstanz an; **×** entfernt sie.
- Erweiterte Blöcke der ersten Ebene zeigen **↺ Zurücksetzen**. Verschachtelte
  oder kompakte Gruppen zeigen nur **↺** mit zugänglicher Beschriftung.

## Zeitgeber

`@autocompact` besitzt genau einen Zeitgeber für seinen gesamten Teilbaum:

- Bedienung in der Grenze oder einem beliebig tiefen Kind startet die Frist
  neu.
- Zeiger- oder Fokusaktivität innerhalb der Grenze pausiert sie.
- Eine geöffnete Phrase oder ein Inline-Editor hält die Grenze offen.
- Nach **Fertig**, **Enter** oder dem Schließen durch einen Außenklick beginnt
  die Frist erneut.
- Nur die nächstgelegene `@autocompact`-Grenze wird beeinflusst.

`autoCompactSeconds` in `app/ts/config.ts` legt die Dauer fest. Der gleichnamige
URL-Parameter überschreibt sie; `0` deaktiviert nur den Zeitgeber, nicht die
manuelle Kompaktierung.

## Untergruppenlayout

`@subgroups(...)` betrifft nur direkte Gruppen-Kinder:

- `flow` ist der Standard. Untergruppen bilden einen umbrechenden Fluss und
  ein zeitgeberfreies Akkordeon.
- `break` beginnt jede direkte Untergruppe in einer eigenen Zeile. Die Inhalte
  dieser Untergruppe bleiben inline.
- Die nächste Ebene fällt wieder auf `flow` zurück, sofern sie nicht selbst
  `@subgroups(break)` trägt.
- Im kompakten Zustand fließen beide Varianten in die Zeile ihrer Elterngruppe
  zurück.

Expansion und Kompaktierung verwenden eine ruhige, erklärende Transition. Bei
systemweit reduzierter Bewegung entfällt sie.

## Ausgabe

- Nur effektiv aufgenommene und vollständig ausgefüllte Phrasen gelangen in
  die Text- und strukturierte Ausgabe.
- Die Gruppenüberschriften auf ihrem Pfad werden in der Textausgabe als Kontext
  mit ausgegeben.
- Sichtbare Bedingungen, Vorschläge, Anforderungen und Offenlegungen allein
  erscheinen nicht in der Ausgabe.
- Kompaktierung beeinflusst die Ausgabe nie.
