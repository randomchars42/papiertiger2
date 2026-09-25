# `.pt`-Referenz

`.pt` ist ein zeilenorientiertes Autorenformat für Papiertiger-Definitionen.
Leerzeilen und vollständige Kommentarzeilen mit `#` werden ignoriert. Einrückung
ordnet Gruppen, Phrasen und Vorgaben zu; Tabulatoren und Leerzeichen dürfen in
einer Einrückung nicht gemischt werden.

## Paketdirektiven

### Namespace

```pt
N: ankunft
```

Der Namespace muss mit dem Dateinamen übereinstimmen und besteht aus
Kleinbuchstaben, Ziffern und Unterstrichen. Enthält das Paket Gruppen, benötigt
genau eine Gruppe `@root`; deren ID ist der Namespace.

### Import

```pt
I: gemeinsam, weiteres_paket
```

Importe werden rekursiv vor dem aktuellen Paket geladen. Sie stellen Gruppen,
Phrasen, Editoren, Wertkataloge und Vorgaben bereit. Zyklen, fehlende Pakete und
doppelte IDs sind Fehler.

## Wertkataloge und Linsen

Ein Paket kann einen wiederverwendbaren Wertkatalog mit stabilen, expliziten
Eintrags-IDs enthalten. Die Quellreihenfolge ist zugleich die bevorzugte
Anzeigereihenfolge. Ein Katalog benötigt keine Linse; dann werden initial seine
ersten Werte in Quellreihenfolge gezeigt. Falls Linsen definiert sind, filtern
sie nur die initial sichtbaren Werte. Eine Suche durchsucht immer den
vollständigen Katalog. Ihr Eingabefeld und ihre Beschriftung werden aus der
verwendenden Phrase abgeleitet.

```pt
N: symptome
I: gemeinsam

L rettungsdienst: Rettungsdienst
L kernteam: Kernteam

V schwindel: Schwindel|a
  @sct=404640003[Dizziness]
  @alias=Drehschwindel; Vertigo; Benommenheit
  @cedis=403[Schwindel] equivalent
  @lens=rettungsdienst; kernteam
  @tag=neurologisch

V freitext: {:freitext=gemeinsam.freitext*:}|a
  @freetext
  @cedis=999[Unbekannt] related
```

| Direktive | Bedeutung |
|---|---|
| `L id: Text` | definiert eine Linse mit sichtbarer Bezeichnung |
| `V id: Text|Art` | definiert einen stabil benannten Katalogwert |
| `@sct=` | optionale SNOMED-CT-Kodierung wie bei Phrasenwerten |
| `@alias=` | mit Semikolon getrennte Suchbegriffe |
| `@cedis=` | CEDIS-Code, Originalbezeichnung und Beziehung |
| `@lens=` | mit Semikolon getrennte Linsen-IDs |
| `@tag=` | mit Semikolon getrennte, paketlokale Bedingungs-Tags |
| `@freetext` | markiert genau einen Freitextwert des Katalogs |

CEDIS-Beziehungen sind `equivalent`, `related`, `broader` oder `narrower`.
Code und Bezeichnung werden beim Kompilieren gegen `cedis.json` geprüft. Die
Zuordnung erzeugt nur Vorschläge für das CEDIS-Plug-in; sie wählt keinen
PCL-Eintrag automatisch aus.

Eine Phrase übernimmt den Katalog mit `@values(...)`:

```pt
I: symptome

G @root: SAMPLER
  P: Symptom* => @values(symptome)
```

Katalogphrasen verwenden die global gewählte Linse. Sie zeigen zuerst deren
Werte und danach ein echtes Suchfeld als letzte Alternative. Mit dem ersten
Suchzeichen ersetzt die Suche die Vorauswahl und durchsucht den vollständigen
Katalog. Das bereits etablierte `*` am Ende des Phrasentitels öffnet auch eine
Katalogauswahl initial; eine zusätzliche Katalogoption ist nicht nötig.

Bedingungen können einen Katalogwert stabil über `paket.wert` referenzieren:

```pt
C schmerz: symptome.brustschmerz / symptome.bauchschmerz
P<!symptome.fieber>: kein Fieber|n
```

Mehrere Katalogwerte lassen sich über ein Tag gemeinsam referenzieren:

```pt
# in symptome.pt
V brustschmerz: Brustschmerz|a
  @tag=schmerz; thorax

# in einem importierenden Paket
C schmerz: @tag(symptome.schmerz)
P<schmerz>: Schmerzstärke => NRS {:wert=nrs*:}|-
```

Ein Wert darf mehrere Tags tragen. Die Abfrage ist immer mit Paket und Tag
qualifiziert; das Paket muss lokal sein oder direkt importiert werden. Der
Compiler ersetzt die Abfrage durch die gegenwärtigen stabilen Wert-IDs und
bricht ab, wenn kein Wert passt. Die Laufzeit benötigt dadurch keine eigene
Tag-Semantik. Freitext wird nicht anhand seiner Eingabe automatisch getaggt.

Verweist eine Bedingung stattdessen auf den Titel einer Katalogphrase, umfasst
sie sämtliche Werte dieses Katalogs sowie zusätzliche, direkt an der Phrase
definierte Werte. Das gilt für lokale und importierte Kataloge; der Compiler
ersetzt beide durch stabile Wert-IDs. Damit können gemeinsame Folgefragen nach
jeder Katalogauswahl sichtbar werden.

Der Compiler fügt die Katalogwerte in die Laufzeitphrase ein. Auswahl,
Wiederholung, Bedingungen und Ausgabe verwenden danach das normale
Textblock-Zustandsmodell.

## Gruppen

```pt
G @root @reset @subgroups(flow) @autocompact: Ankunft
  G @inactive: Auffindeort
    P: in der Wohnstätte|-
```

Eine Gruppe kann folgende voneinander unabhängige Annotationen tragen:

| Annotation | Wirkung |
|---|---|
| `@root` | Wurzel des Pakets |
| `@reset` | separat zurücksetzbar |
| `@summary` | fasst auffällige aufgenommene Einträge zusammen |
| `@subgroups(flow)` | ordnet direkte Untergruppen in einem umbrechenden Zeilenfluss an; dies ist der Standard |
| `@subgroups(break)` | lässt jede direkte Untergruppe in einer eigenen Zeile beginnen |
| `@autocompact` | setzt für die Gruppe und ihren Teilbaum eine Inaktivitätsfrist |
| `@reveal(...)` | öffnet die Gruppe vorübergehend, sobald die angegebene Bedingung neu erfüllt ist |
| `@reveal(initial)` | beginnt erweitert und bleibt bis zur ersten Bedienung offen |
| `@active(linse; ...)` | initial nur in den genannten Linsen aktiv |
| `@inactive` | initial nicht in die Ausgabe eingeschlossen |
| `@repeat(...)` | wiederholbare Gruppe |
| `@score(...)` | erzeugt einen additiven Rechner aus markierten Werten |

Der optionale Gruppentyp verwendet dieselben Kurzzeichen wie Werte, zum
Beispiel `Orientierung|n` oder `Blutung|a`.

Oberfläche und gerenderte Textausgabe ergänzen jede Gruppenüberschrift um
einen abschließenden Doppelpunkt. Er gehört nicht zum Titel und muss deshalb
in der `.pt`-Quelle nicht wiederholt werden; ein bereits vorhandener
Doppelpunkt wird nicht verdoppelt.

Gruppeneinschluss, Offenlegung und Untergruppenlayout bleiben getrennte
Zustände, werden bei einem Überschriftenklick aber gemeinsam bedient:
Deaktivieren deaktiviert und kompaktiert die Gruppe; Aktivieren aktiviert sie
und öffnet den nötigen Pfad. Ohne Annotation beginnt eine Gruppe aktiv.
`@inactive` setzt einen generell inaktiven Anfangszustand;
`@active(rettungsdienst; kernteam)` setzt stattdessen einen von der globalen
Linse abhängigen aktiven Anfangszustand. Beide Annotationen schließen einander
aus. Eine ausdrückliche Benutzerentscheidung hat Vorrang und bleibt beim
Linsenwechsel erhalten; Zurücksetzen entfernt sie und stellt den gegenwärtigen
linsenabhängigen Anfangszustand wieder her. Eine
inaktive Gruppe behält Auswahl und Attribute ihrer Kinder, unterdrückt aber
deren effektiven Einschluss in Ausgabe, Bedingungen und aktive Hervorhebung.
Von außen ausgelöste Vorschläge bleiben sichtbar, ohne die Gruppe oder ihre
Vorfahren zu aktivieren. `@subgroups(...)` und eine reine Bedienung über
**…** beziehungsweise **≪** verändern nur die Darstellung. Eine ausdrückliche
Auswahl oder Bearbeitung eines Kindes aktiviert dagegen dessen inaktiven
Gruppenpfad, damit die Auswahl unmittelbar effektiv aufgenommen werden kann.

`@reveal(...)` verwendet dieselben Bedingungsreferenzen wie `G<...>` und
`P<...>`, verändert aber weder Sichtbarkeit noch Einschluss. Beim Übergang der
Bedingung von nicht erfüllt zu erfüllt wird der vollständige Pfad zur
Zielgruppe erweitert und bis zur ersten Bedienung in diesem Pfad offengehalten:

```pt
C hinweise_noetig: Kritischer Befund

G @reveal(hinweise_noetig): Hinweise
  P: ärztliche Rücksprache empfohlen|-
```

Wird die Bedingung später erneut falsch und wieder wahr, kann die Gruppe erneut
offengelegt werden. Eine bereits erfüllte Bedingung gilt beim ersten Rendern
ebenfalls als Offenlegungsereignis. Verschwindet die Bedingung vor der ersten
Bedienung im offengelegten Pfad, wird dessen vorheriger kompakter Zustand
wiederhergestellt. Vorschlagsbedingte Offenlegung folgt derselben Regel.

`@reveal(initial)` benötigt keine Bedingung. Es erweitert die Zielgruppe beim
ersten Rendern und eine damit markierte neue Wiederholungsinstanz beim Anlegen.
Die erste Bedienung im offengehaltenen Pfad löst den Halt; erst dann beginnt die
normale `@autocompact`-Frist.

Eine Gruppe beginnt erweitert, solange weder sie selbst noch ein Vorfahr eine
`@autocompact`-Grenze bildet. Die markierte Grenze und ihr gesamter Teilbaum
beginnen kompakt. `@reveal(initial)`, eine neu erfüllte Offenlegungsbedingung
oder ein neuer Vorschlag erweitert den jeweils nötigen Pfad vorübergehend. Eine
über **+** neu angelegte Wiederholungsinstanz wird als unmittelbare
Benutzeraktion ebenfalls geöffnet. Eine
kompakte Grenze zeigt als Minimum ausschließlich effektiv aufgenommene Phrasen,
offene Vorschläge, gegenwärtig bedingt sichtbare Gruppen und die Überschriften
auf deren Pfaden. Ihre eigene Überschrift bleibt unabhängig davon erhalten.
Nur Gruppen mit effektiv
aufgenommenen Nachfahren erhalten die aktive Überschriftenmarkierung;
Vorschläge aktivieren oder markieren ihre Vorfahren nicht. Die Reihenfolge
bleibt stabil wie in der `.pt`-Quelle und wird nicht nach Aktivität sortiert.
Die früheren Annotationen `@collapsed`, `@inline` und `@autocollapse` sind
daher nicht mehr Teil des Formats.

Ein Klick auf eine Gruppenüberschrift schaltet ihren Einschluss samt dem oben
beschriebenen Kompakt-/Offenlegungsschritt um. **…** erweitert nur die
Darstellung; im erweiterten Zustand ersetzt **≪** dieses Zeichen am Ende
derselben Inhaltszeile. Die Bedienung eines anderen sichtbaren Elements im
Minimum öffnet zuerst die umgebende `@autocompact`-Grenze und führt danach die
ursprüngliche Aktion aus. Untergruppen benötigen deshalb in diesem Minimum kein
eigenes Disclosure. Nur die Überschrift der `@autocompact`-Grenze ist
ausgenommen: Sie deaktiviert und kompaktiert unmittelbar. **+** ist
ausschließlich die Aktion zum Anlegen einer wiederholbaren Instanz; **×**
entfernt eine Instanz. Ein erweiterter Block der ersten Ebene zeigt
**↺ Zurücksetzen** ausgeschrieben, verschachtelte beziehungsweise kompakte
Gruppen zeigen nur **↺** mit zugänglicher Beschriftung. Auswahl und Attribute
bleiben beim Deaktivieren oder Kompaktwerden erhalten.

Die Überschrift einer Untergruppe, ihre direkten Phrasen und ihr abschließendes
Disclosure bilden ohne weitere Annotation einen gemeinsamen umbrechenden
Fluss. `@subgroups(flow)` und `@subgroups(break)` steuern ausschließlich die
direkten Gruppen-Kinder, nicht die Phrasen. `flow` ist der Standard und bildet
zusätzlich ein Akkordeon: Öffnen einer Untergruppe macht ihre offenen
Geschwister kompakt. Bei `break` beginnt jede direkte Untergruppe in einer
eigenen Zeile, bleibt darin aber selbst inline. Deren eigene Untergruppen
fließen wieder, sofern die Untergruppe nicht ihrerseits `@subgroups(break)`
trägt. Im kompakten Zustand sehen beide Layouts gleich aus und fließen in die
Zeile der Elterngruppe zurück. Reihenfolge und Gruppenzugehörigkeit bleiben aus
der `.pt`-Quelle erhalten.

`@autocompact` markiert eine Zeitgebergrenze. Bedienung in der Gruppe oder einem
beliebig tiefen Kind setzt ausschließlich die nächstgelegene solche Frist
zurück. Zeiger- und Fokusaktivität pausieren sie; ein offener Inline-Editor hält
die Grenze offen. Nach **Fertig** oder **Enter** läuft die Frist erneut. Die
Dauer wird über `autoCompactSeconds` konfiguriert; `0` schaltet die Automatik
aus. Expansion und Kompaktierung sind mit einer ruhigen, längeren
Transition sichtbar und respektieren reduzierte Bewegung. Das Kompaktwerden
ändert weder Gruppeneinschluss noch gespeicherte Kindzustände.

Ein Klick außerhalb einer geöffneten Phrase und ihres Inline-Editors beendet
die Bearbeitung, bevor die angeklickte Bedienung ausgeführt wird. Nicht leere
einzeilige Eingaben wählen ihren Inhalt beim ersten Fokus vollständig aus.

Eine importierte Wurzelgruppe wird mit `U:` eingefügt:

```pt
N: status
I: orientierung

G @root: Status
  U: orientierung
```

### Wiederholung

```pt
G @repeat(initial=0,add="Blutung hinzufügen",empty="Blutung") @reset: Blutung|a
```

| Option | Bedeutung |
|---|---|
| `initial` | anfängliche Instanzzahl, Standard `0` |
| `add` | zugängliche Beschriftung und Tooltip der Hinzufügen-Schaltfläche; erforderlich |
| `empty` | Titel der Phrase, die ohne vollständig aufgenommene Instanz den leeren/normalen Zustand vertritt |

Jede Instanz erhält eigenen Zustand und eigene Attribute. Verschachtelte
wiederholbare Gruppen werden derzeit nicht unterstützt. Eine Instanz gilt für
`empty` als vollständig, sobald mindestens eine ihrer Phrasen effektiv
aufgenommen und alle dafür erforderlichen Attribute ausgefüllt sind. Eine nur
angelegte, noch leere oder vollständig ausgeschlossene Instanz verdrängt die
Leeren-Phrase daher nicht.

Die sichtbare Hinzufügen-Schaltfläche verwendet den kompakten Gruppentitel mit
`+`, beispielsweise `Schmerz +`. Dieses Zeichen ist ausschließlich dem Anlegen
einer Instanz vorbehalten. Der ausführlichere `add`-Text bleibt als zugänglicher
Name und Tooltip erhalten.

### Additive Scores

Eine Gruppe kann einen Rechner aus ihren vorhandenen Phrasen erzeugen:

```pt
E gcs_summe: number label="GCS-Summe" min=3 max=15 step=1

G @score(id=gcs,label="GCS berechnen",target="GCS-Summe",attribute=summe): Glasgow Coma Scale
  P: Augenöffnen => spontan @points=4|n / auf Ansprache @points=3|a / auf Druck @points=2|a / kein Öffnen @points=1|a
  P: GCS-Summe => GCS {:summe=gcs_summe*:}|-
```

`id` und `label` benennen Rechner und Schaltfläche. `target` verweist auf eine
direkte Phrase derselben Gruppe; `attribute` benennt deren Zahlenattribut. Jede
Kriterienphrase wird durch `@points=<ganze Zahl>` an allen ihren Werten
gekennzeichnet. Phrasen ganz ohne `@points` gehören nicht zum Rechner.

Der Compiler prüft vollständige Punktangaben, das Zahlenattribut sowie die aus
den Kriterien abgeleiteten Minimal- und Maximalwerte gegen den Editor. Das
Textblock-Plug-in prüft ein übergebenes Rechnerergebnis erneut. **In
Textbaustein übernehmen** setzt die gewählten Kriterien und den Gesamtwert
unmittelbar als aktive Benutzerauswahl mit Rechnerprovenienz.

### Abhängige Gruppen

```pt
G @repeat(initial=0,add="Schmerz hinzufügen"): Schmerz
  P: Schmerz => Brustschmerz|a / Bauchschmerz|a
  G<Schmerz>: Ausstrahlung
    P: in den Rücken|-
    P: in den Arm|-
```

`G<Bedingung>:` zeigt eine verschachtelte Gruppe nur, solange die Bedingung
erfüllt ist. Ist sie nicht erfüllt, erscheint die Gruppe weder in der
Oberfläche noch in Text-, Daten- oder Zusammenfassungsausgaben; ihr vorhandener
Zustand bleibt erhalten. Innerhalb einer wiederholbaren Gruppe wird die
Bedingung ausschließlich gegen die Werte derselben Instanz geprüft. Eine
Bedingung außerhalb der Wiederholung berücksichtigt dagegen aufgenommene Werte
aus allen Instanzen. So kann beispielsweise `P<Brustschmerz>:` außerhalb einer
wiederholbaren Schmerzgruppe erscheinen, sobald mindestens eine Instanz den
Wert `Brustschmerz` enthält.

Die wiederholbare Gruppe selbst kann nicht bedingt sein. Eine bedingte Gruppe
innerhalb einer Wiederholung ist dagegen zulässig.

## Phrasen und Werte

```pt
P: Atmung => Eupnoe|n* / Tachypnoe|a / beatmet|i
```

Links von `=>` steht der eindeutige sichtbare Phrasentitel. Rechts stehen mit
` / ` getrennte Werte.

| Kürzel | Typ |
|---|---|
| `|n` | normal |
| `|a` | auffällig |
| `|i` | Intervention |
| `|-` | neutral |

Ein angehängtes `*` markiert den Standardwert. Pro Phrase ist höchstens ein
Standard erlaubt.

`@points=<ganze Zahl>` hinter dem sichtbaren Wert markiert dessen Beitrag zu
einem additiven `@score`. Falls derselbe Wert eine SNOMED-Kodierung besitzt,
steht `@points` nach `@sct=...`.

Eine Phrase mit identischem Titel und Ausgabetext kann verkürzt werden:

```pt
P: Kompression|i
```

Ohne Standard bleibt eine unbedingte Phrase sichtbar, aber nicht aufgenommen.
Eine bedingte Phrase ohne Standard bleibt verborgen, bis eine Bedingung greift.

### Sequenziell geöffnete Auswahl

Ein `*` am Ende des Phrasentitels öffnet die Auswahl initial:

```pt
P: Leitsymptom* => Atemnot|a / Brustschmerz|a / Synkope|a
P: Verlauf* => zunehmend|- / gleichbleibend|- / rückläufig|-
```

Die Markierung ist nur für Phrasen mit mindestens zwei Werten zulässig und ist
vom `*` am Ende eines Werts für dessen Standardauswahl unabhängig. Sind mehrere
markierte Phrasen sichtbar, öffnet die Laufzeit jeweils genau einen Editor in
Quellreihenfolge. Nach einer Auswahl oder `Fertig` folgt die nächste markierte
Phrase. Erforderliche Attribute werden zuvor abgeschlossen. Inaktive Gruppen
werden übersprungen, bis sie aktiviert werden; ein kompakter Pfad wird für den
nächsten Editor automatisch geöffnet. Ein Zurücksetzen startet die Reihenfolge
erneut.

### SNOMED CT

```pt
P: Zustand => Atemweg frei @sct=248553004[No obstruction of airway]|n*
```

`@sct=` ist optional. Ist es vorhanden, folgt auf die reine numerische SCTID
oder den Ausdruck zwingend die menschenlesbare SNOMED-Bezeichnung in `[...]`.
Sie erleichtert die fachliche Prüfung und wird als `display` in die strukturierte
Kodierung übernommen. Der deutsche Ausgabetext vor `@sct=` bleibt davon
getrennt und kann ohne Kodierung verwendet werden.

```pt
P: Schmerz => kein Schmerz @sct=413350009:{246090004=22253000},{408729009=410516002},{408731000=410512000},{408732007=410604004}[Pain known absent, current, subject of record]|n*
```

Eine reine SCTID wird als Code ausgegeben, ein komplexerer Inhalt als Ausdruck.
Die Bezeichnung in eckigen Klammern beschreibt bei einem Ausdruck die gesamte
Aussage. Eckige Klammern innerhalb der Bezeichnung sind nicht zulässig. Wird
dieselbe SCTID oder derselbe Ausdruck mehrfach verwendet, muss die Bezeichnung
über alle `.pt`-Pakete hinweg identisch sein; der Compiler prüft diese Regel.

## Bedingungen und Vorschläge

```pt
C verlegter_atemweg: Atemweg durch Zunge verlegt / Atemweg durch Blutung verlegt

P<verlegter_atemweg>: Güdeltubus => Atemwegsschienung: Güdeltubus|i
```

Eine Bedingung kann referenzieren:

1. einen Alias aus `C:`;
2. einen eindeutigen Phrasentitel, der alle Werte dieser Phrase umfasst;
3. den vollständigen eindeutigen Quelltext eines Werts.

Bei einer einwertigen Zielphrase wird dieser Wert vorgeschlagen. Bei genau zwei
Werten mit einem Standard wird der andere Wert vorgeschlagen. Andernfalls wird
die Phrase ohne vorgewählten Wert vorgeschlagen.

Ein Vorschlag bleibt bis zu seiner Annahme außerhalb der Ausgabe und erhält
deshalb keine dauerhafte Fläche oder Umrandung. Sein erstmaliges Erscheinen wird
mit einem ruhigen 1,6-sekündigen Puls hervorgehoben; bei reduzierter Bewegung
entfällt diese Animation. Ein neu entstandener Vorschlag öffnet außerdem immer
seinen vollständigen Gruppenpfad und hält ihn bis zur ersten Bedienung in diesem
Pfad offen; dafür ist kein `@reveal(...)` an einer übergeordneten Gruppe nötig.

Eine Phrase mit erforderlichen Attributen gilt erst nach deren Vervollständigung
als aktiver Auslöser.

Mehrere Referenzen werden weiterhin mit ` / ` getrennt und als Alternativen
behandelt: Eine davon muss aktiv sein. Für die einfache Negation erhält jede
Referenz ein vorangestelltes `!`:

```pt
P<!Schmerz>: schmerzfreie Vorstellung|n
G<!Schmerz>: Andere Beschwerden
  P: Übelkeit|a
```

Eine negierte Bedingung ist erfüllt, wenn keiner der referenzierten Werte aktiv
ist. Bei mehreren Referenzen müssen entweder alle positiv oder alle negiert
sein; Mischungen sind ein Compilerfehler. Weitere Operatoren, Klammern oder eine
allgemeine boolesche Ausdruckssprache gibt es bewusst nicht.

Editorwerte selbst sind keine Bedingung. Vergleiche wie `wert >= 5` oder
`seite = links` sind noch nicht Teil des Formats.

## Attribute und Editoren

### Platzhalter

```pt
{:name:}                 # optional
{:name*:}                # erforderlich
{:name=lokaler_editor*:}
{:name=paket.editor*:}
```

Im kompilierten Ausgabetext bleibt nur die Attribut-ID stehen; die Editorbindung
wird separat gespeichert. Derselbe Attributname darf innerhalb einer Phrase
nicht verschiedene Editoren verwenden.

`{:freitext*:}` bindet automatisch `gemeinsam.freitext`, wenn `gemeinsam`
importiert ist.

### Text

```pt
E bemerkung: text label="Bemerkung" placeholder="Freitext" prefix=""
```

Optionen: `label`, `prefix`, `placeholder`.

### Zahl

```pt
E nrs: number label="NRS" prefix="NRS " min=0 max=10 step=1
```

Optionen: `label`, `prefix`, `suffix`, `min`, `max`, `step`, `default`.

### Dauer

```pt
E seit: duration label="Zeitangabe" prefix=" seit " units=minute,hour,day,week,month,year default=day
```

Optionen: `label`, `prefix`, `units`, `default`. Die festen internen
Einheiten heißen `minute`, `hour`, `day`, `week`, `month`, `year`; die sichtbare
deutsche Beugung erzeugt die Laufzeit.

### Datum und Datum/Zeit

```pt
E datum: date label="Datum" prefix=" am "
E zeitpunkt: datetime label="Datum und Zeit" default=now
```

`date` kennt `label` und `prefix`. `datetime` kennt zusätzlich `default=now`.

### Auswahl

```pt
E seite: choice label="Seite" => links|- / rechts|-
```

Auswahlwerte tragen ebenfalls einen semantischen Typ und können einen
Standardwert `*` besitzen.

## Vorgaben

```pt
S: Pneumonie|a
  Atmung = Tachypnoe
  Brummen = Brummen
```

Die linke Seite einer Zuweisung ist ein eindeutiger Phrasentitel, die rechte
Seite ein Werttext genau dieser Phrase. Vorgaben verändern keine Definitionen;
sie setzen mehrere Werte im Laufzeitzustand. Manuelle Änderungen haben Vorrang.

## Dokumentkatalog

`documents.pt` verwendet einen eigenen kleinen Abschnitt:

```pt
T: dokumente

W: updates updates label="Neuigkeiten"

D*: Rettungsdienst
  B: textblock ankunft controls=false

D: Erstbefund
  B: textblock abcde controls=false
```

| Direktive | Bedeutung |
|---|---|
| `T: dokumente` | kennzeichnet den Dokumentkatalog |
| `W:` | globales Werkzeug: Plug-in, Werkzeug-ID und optionale Parameter |
| `D*:` | Standarddokument |
| `D:` | weiteres Dokument |
| `B:` | Plug-in, Definitions-ID und optionale Parameter |

Dokument-IDs werden aus den sichtbaren Titeln abgeleitet.

## Abgeleitete IDs

Der Compiler transliteriert unter anderem `ä/ö/ü/ß` zu `ae/oe/ue/ss` und
erzeugt typisierte IDs:

```text
<paket>_gruppe_<titel>
<paket>_eintrag_<titel>
<phrase>_wert_<werttext>
<paket>_eingabe_<name>
<paket>_vorgabe_<titel>
```

Die Wurzelgruppe heißt nur `<paket>`. Platzhalter werden bei der Wert-ID
weggelassen. Ergibt sich dadurch eine Kollision, bricht die Kompilierung ab.

## Compiler

```bash
make compile
python3 scripts/compile_textblocks.py --check
python3 scripts/compile_textblocks.py app/data/a.pt
```

Ohne Dateiangaben werden alle `.pt`-Dateien unter `app/data/` verarbeitet.
`--check` schreibt nichts und schlägt fehl, wenn JSON fehlt oder nicht exakt der
aktuellen Quelle entspricht. Erst nach erfolgreichem Parsen und Prüfen aller
gewählten Quellen werden Ausgabedateien atomar ersetzt.
