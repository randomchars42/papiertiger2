# `.pt`-Referenz

`.pt` ist ein zeilenorientiertes Autorenformat für Papiertiger-Definitionen.
Leerzeilen und vollständige Kommentarzeilen mit `#` werden ignoriert. Einrückung
ordnet Gruppen, Phrasen und Vorgaben zu; Tabulatoren und Leerzeichen dürfen in
einer Einrückung nicht gemischt werden.

## Paketdirektiven

### Namespace

```pt
N: umstaende
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
Eintrags-IDs enthalten. Die globalen Linsen werden einmal im Dokumentkatalog
definiert; Katalogwerte referenzieren sie nur. Die Quellreihenfolge ist zugleich
die bevorzugte Anzeigereihenfolge. Enthält ein Katalog keine `@lens`-Zuordnung,
werden initial seine ersten Werte in Quellreihenfolge gezeigt. Andernfalls
filtert die aktive Linse nur die initial sichtbaren Werte. Eine Suche durchsucht
immer den vollständigen Katalog. Ihr Eingabefeld und ihre Beschriftung werden
aus der verwendenden Phrase abgeleitet.

```pt
N: symptome
I: gemeinsam

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
| `V id: Text|Art` | definiert einen stabil benannten Katalogwert |
| `@sct=` | optionale SNOMED-CT-Kodierung wie bei Phrasenwerten |
| `@alias=` | mit Semikolon getrennte Suchbegriffe |
| `@cedis=` | CEDIS-Code, Originalbezeichnung und Beziehung |
| `@lens=` | mit Semikolon getrennte Linsen- oder Linsengruppen-IDs |
| `@tag=` | mit Semikolon getrennte, paketlokale Bedingungs-Tags |
| `@freetext` | markiert genau einen Freitextwert des Katalogs |

CEDIS-Beziehungen sind `equivalent`, `related`, `broader` oder `narrower`.
Sie beschreiben den CEDIS-Zielbegriff aus Sicht des Katalogwerts:
`broader` bedeutet beispielsweise, dass der vorgeschlagene CEDIS-Eintrag
breiter ist als das konkret erfasste Symptom. Die Oberfläche zeigt diese
Beziehung bei jedem Vorschlag an.
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
Katalog. In diesem Feld bewegen `Pfeil hoch` und `Pfeil runter` die aktive
strukturierte Auswahl, `Enter` übernimmt sie und `Strg+Enter` beziehungsweise
`Cmd+Enter` übernimmt den Suchtext ausdrücklich als Freitext. `Escape` schließt
die Auswahl ohne neue Übernahme. Das bereits etablierte `*` am Ende des
Phrasentitels öffnet auch eine Katalogauswahl initial; eine zusätzliche
Katalogoption ist nicht nötig.

Bedingungen können einen Katalogwert stabil über `paket.wert` referenzieren:

```pt
C schmerz: symptome.brustschmerz; symptome.bauchschmerz
P condition(!symptome.fieber): kein Fieber|n
```

Mehrere Katalogwerte lassen sich über ein Tag gemeinsam referenzieren:

```pt
# in symptome.pt
V brustschmerz: Brustschmerz|a
  @tag=schmerz; thorax

# in einem importierenden Paket
C schmerz: @tag(symptome.schmerz)
P condition(schmerz): Schmerzstärke => NRS {:wert=nrs*:}|-
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
| `@active(linse; ...)` | initial nur in den genannten Linsen oder Linsengruppen aktiv |
| `@lens(linse; ...)` | ist nur in den genannten Linsen oder Linsengruppen vorhanden |
| `@inactive` | initial nicht in die Ausgabe eingeschlossen |
| `@repeat(...)` | wiederholbare Gruppe |
| `@score(...)` | erzeugt einen additiven Rechner aus markierten Werten |

Der optionale Gruppentyp verwendet dieselben Kurzzeichen wie Werte, zum
Beispiel `Orientierung|n` oder `Blutung|a`.

Normalerweise entsteht die Gruppen-ID aus dem sichtbaren Titel. Bei gleichen
Titeln kann vor dem Doppelpunkt eine optionale stabile ID stehen:

```pt
G telefonische_quellen: telefonisch
```

Die Wurzelgruppe behält immer die Paket-ID und erlaubt daher keine explizite ID.

Oberfläche und gerenderte Textausgabe ergänzen jede Gruppenüberschrift um
einen abschließenden Doppelpunkt. Er gehört nicht zum Titel und muss deshalb
in der `.pt`-Quelle nicht wiederholt werden; ein bereits vorhandener
Doppelpunkt wird nicht verdoppelt.

### Sichtbarkeit und Kompaktierung

Die vollständigen, normativen Regeln stehen zentral unter
[Sichtbarkeit und Kompaktierung](visibility-and-compaction.md). Für die Syntax
gelten insbesondere:

- `condition(...)` steht bei Gruppen wie bei Phrasen direkt nach `G`
  beziehungsweise `P`;
- `@inactive`, `@active(...)` und `@lens(...)` steuern unterschiedliche
  Stufen und sind nicht mit Kompaktierung gleichzusetzen;
- `@reveal(...)` und `@reveal(initial)` ändern nur die Offenlegung;
- `@subgroups(flow|break)` ändert nur das Layout direkter Gruppen-Kinder;
- `@autocompact` definiert eine kompakte Grenze samt Zeitgeber.

Die früheren Formen `G<...>`, `@collapsed`, `@inline` und `@autocollapse` sind
nicht mehr Teil des Formats.

Ein Klick außerhalb einer geöffneten Phrase oder ihres Inline-Editors beendet
die Bearbeitung vor der angeklickten Aktion. Nicht leere einzeilige Eingaben
wählen ihren Inhalt beim ersten Fokus vollständig aus.

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
gekennzeichnet. `@points=UN` markiert eine vollständig ausgewählte, nicht
prüfbare Alternative. Sie bleibt als `UN` dokumentiert und trägt `0` zur Summe
bei. Phrasen ganz ohne `@points` gehören nicht zum Rechner. Jedes Kriterium
benötigt mindestens eine numerische Alternative.

Eine direkte `R`-Zeile kann eine fachlich zwingende Auswahl innerhalb desselben
Scores ableiten:

```pt
R<Koma>: Sensibilität = schwere Sensibilitätsstörung; Sprache = globale Aphasie
```

Der Auslöser muss genau einen Wert des Scores bezeichnen. Jede mit Semikolon
getrennte Zuweisung nennt eine Kriterienphrase und einen ihrer Werte. Abgeleitete
Auswahlen ersetzen im Rechner eine vorhandene manuelle Auswahl, sind dort
sichtbar als automatisch gesetzt gekennzeichnet und bleiben gesperrt, solange
der Auslöser ausgewählt ist. Fällt der Auslöser weg, werden sie geleert. Regeln
dürfen nicht eine Kriterienphrase setzen, die selbst eine weitere Regel
auslöst; widersprüchliche Zuweisungen sind ebenfalls ein Compilerfehler.

Der Compiler prüft vollständige Punktangaben, das Zahlenattribut sowie die aus
den Kriterien abgeleiteten Minimal- und Maximalwerte gegen den Editor. Das
Textblock-Plug-in prüft ein übergebenes Rechnerergebnis erneut. **In
Textbaustein übernehmen** setzt die gewählten Kriterien und den Gesamtwert
unmittelbar als aktive Benutzerauswahl mit Rechnerprovenienz. `UN`-Auswahlen
bleiben dabei als Einzelangaben erhalten und werden für den Gesamtwert als `0`
gerechnet. Die Laufzeit prüft Score-Regeln, Werte und Summe erneut vor der
Übernahme.

### Abhängige Gruppen

```pt
G @repeat(initial=0,add="Schmerz hinzufügen"): Schmerz
  P: Schmerz => Brustschmerz|a / Bauchschmerz|a
  G condition(Schmerz): Ausstrahlung
    P: in den Rücken|-
    P: in den Arm|-
```

`G condition(Bedingung):` zeigt eine verschachtelte Gruppe nur, solange die
Bedingung erfüllt ist. Ist sie nicht erfüllt, erscheint die Gruppe weder in der
Oberfläche noch in Text-, Daten- oder Zusammenfassungsausgaben; ihr vorhandener
Zustand bleibt erhalten. Innerhalb einer wiederholbaren Gruppe wird die
Bedingung ausschließlich gegen die Werte derselben Instanz geprüft. Eine
Bedingung außerhalb der Wiederholung berücksichtigt dagegen aufgenommene Werte
aus allen Instanzen. So kann beispielsweise
`P condition(Brustschmerz):` außerhalb einer wiederholbaren Schmerzgruppe
erscheinen, sobald mindestens eine Instanz den Wert `Brustschmerz` enthält.

Die wiederholbare Gruppe selbst kann nicht bedingt sein. Eine bedingte Gruppe
innerhalb einer Wiederholung ist dagegen zulässig.

Gruppen unterstützen ausschließlich `condition(...)`. `suggest(...)` und
`require(...)` gehören zu Phrasen, weil nur dort ein eindeutiger zu erledigender
Wert existiert. Gruppenweite Aufmerksamkeit bleibt eine
[offene Grenze](open-boundaries.md#gruppenweite-aufmerksamkeit).

## Phrasen und Werte

```pt
P: Atmung => Eupnoe|n* / Tachypnoe|a / beatmet|i
```

Links von `=>` steht der eindeutige sichtbare Phrasentitel. Rechts stehen mit
` / ` getrennte Werte.

Eine optionale stabile ID steht nach `P` beziehungsweise nach dem Phrasenmodus
und entkoppelt die technische ID vom sichtbaren Titel:

```pt
P begleitung_partnerin: Partnerin|-
P telefon_partnerin: Partnerin|-
P condition(telefon_partnerin) kontakt_erfolgreich: Kontakt erfolgreich|-
```

Explizite Phrasen-IDs können wie eindeutige Titel in Bedingungen und Vorgaben
referenziert werden. Sichtbare Titel dürfen sich wiederholen, sofern alle
betroffenen Phrasen unterschiedliche explizite IDs besitzen; ein Verweis über
den dann mehrdeutigen Titel bleibt ein Compilerfehler.

Soll nur ein bestimmter Wert einer solchen Phrase auslösen, folgt auf die
explizite ID ein `=` und der sichtbare Werttext. Das hält kurze, im
Gruppenkontext verständliche Werte auch dann eindeutig, wenn sie in mehreren
Phrasen vorkommen:

```pt
P nikotinstatus: Nikotinstatus => verneint|n / vormals|a / aktiv|a
P condition(nikotinstatus=vormals; nikotinstatus=aktiv): Konsumhäufigkeit dokumentieren|-
```

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

## Bedingungen und Aufmerksamkeitsstufen

```pt
C verlegter_atemweg: Atemweg durch Zunge verlegt; Atemweg durch Blutung verlegt

P condition(verlegter_atemweg): Güdeltubus => Atemwegsschienung: Güdeltubus|i
P suggest(Brustschmerz): letzte Koronarangiographie => letzte Koronarangiographie {:zeitpunkt*:}|-
P require(Intubation): Bestätigung der Tubuslage => kapnographisch bestätigt|i / kapnometrisch bestätigt|i
```

Eine Bedingung kann referenzieren:

1. einen Alias aus `C:`;
2. einen eindeutigen Phrasentitel, der alle Werte dieser Phrase umfasst;
3. den vollständigen eindeutigen Quelltext eines Werts;
4. mit `phrasen_id=werttext` genau einen Wert einer explizit benannten Phrase.

Der Modus vor einer Phrase bestimmt, wie die Bedingung ihre Darstellung
beeinflusst:

| Modus | Bedingung nicht erfüllt | Bedingung erfüllt, aber nicht erledigt |
|---|---|---|
| `condition(...)` | Phrase ist verborgen | Phrase wird bedingt sichtbar |
| `suggest(...)` | Phrase bleibt gewöhnlich verfügbar | Phrase wird als Vorschlag markiert |
| `require(...)` | Phrase bleibt gewöhnlich verfügbar | Phrase wird stärker und mit `(!)` als erforderlich markiert |

Kein Modus nimmt die Phrase automatisch in die Ausgabe auf. Eine bedingte
Phrase erhält bei einem Wert genau diesen Kandidaten. Bei genau zwei Werten mit
einem Standard ist der andere Wert der Kandidat. Andernfalls öffnet die Phrase
ihre normale Auswahl ohne vorgewählten Kandidaten. `condition(...)` darf keinen
Standardwert besitzen; ein bedingter Standard wäre bereits vor erfüllter
Bedingung aufgenommen und widerspräche damit der Sichtbarkeitsregel.

`suggest(...)` und `require(...)` verändern weder vorhandenen Wert noch
Aufnahmezustand. Ein konkreter Kandidat ist erledigt, sobald genau dieser Wert
effektiv aufgenommen und vollständig ist; ohne eindeutigen Kandidaten genügt
ein beliebiger vollständig aufgenommener Wert. **Weglassen** bestätigt die
Ablehnung eines Vorschlags. Eine erforderliche Phrase bleibt dagegen auch nach
**Weglassen** oder der Wahl eines anderen Werts offen erforderlich. Dafür soll
eine fachlich zulässige Nichterhebung als eigener Wert definiert werden.

Eine neu entstandene Aufmerksamkeitsstufe wird mit einem ruhigen
1,6-sekündigen Puls hervorgehoben; bei reduzierter Bewegung entfällt diese
Animation. Sie öffnet außerdem ihren vollständigen Gruppenpfad und hält ihn bis
zur ersten Bedienung in diesem Pfad offen. Danach darf der Pfad wieder
kompaktieren, die unerledigte Phrase bleibt aber Teil des kompakten Minimums.
Beim ersten Rendern bereits erfüllte Bedingungen erscheinen im Minimum, lösen
jedoch keine zusätzliche Ankunftsanimation oder Offenlegung aus. Dafür ist bei
Bedarf `@reveal(initial)` vorgesehen.

Eine Phrase mit erforderlichen Attributen gilt erst nach deren Vervollständigung
als aktiver Auslöser.

Mehrere Referenzen werden mit `;` getrennt und als Alternativen behandelt: Eine
davon muss aktiv sein. Das gilt einheitlich für `C`, `G condition(...)`,
`condition(...)`, `suggest(...)`, `require(...)` und `@reveal(...)`. `/` ist
dagegen ausschließlich der Trenner zwischen auswählbaren Werten rechts von
`=>`. Für die einfache Negation erhält jede Referenz ein vorangestelltes `!`:

```pt
P condition(!Schmerz): schmerzfreie Vorstellung|n
G condition(!Schmerz): Andere Beschwerden
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

### Mehrzeiliger Text

```pt
E verlauf: multiline label="Ergänzende Beschreibung" placeholder="Freier Verlauf" rows=2 maxrows=6
```

Optionen: `label`, `prefix`, `placeholder`, `rows`, `maxrows`. Das Feld wächst
bis `maxrows` automatisch mit. `Enter` erzeugt einen Zeilenumbruch;
`Strg+Enter` beziehungsweise `Cmd+Enter` übernimmt den Inhalt und schließt den
Editor. `Escape` schließt ihn ebenfalls. Ein mehrzeiliger Wert bleibt wie
einzeiliger Text ein gewöhnlicher String im Zustand und in der strukturierten
Ausgabe.

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

L* rettungsdienst: Rettungsdienst
L kernteam: Kernteam
L trauma_orthopaedie: Trauma & Orthopädie
L neurochirurgie: Neurochirurgie

LG klinik: kernteam; trauma_orthopaedie; neurochirurgie
LG praeklinik: rettungsdienst

D*: Rettungsdienst
  B: textblock umstaende controls=false

D: Erstbefund
  B: textblock abcde controls=false
```

| Direktive | Bedeutung |
|---|---|
| `T: dokumente` | kennzeichnet den Dokumentkatalog |
| `W:` | globales Werkzeug: Plug-in, Werkzeug-ID und optionale Parameter |
| `L* id: Text` | definiert die globale Standardlinse |
| `L id: Text` | definiert eine weitere globale Linse |
| `LG id: linse; ...` | definiert eine vom Compiler aufgelöste Linsengruppe |
| `D*:` | Standarddokument |
| `D:` | weiteres Dokument |
| `B:` | Plug-in, Definitions-ID und optionale Parameter |

Dokument-IDs werden aus den sichtbaren Titeln abgeleitet. Linsengruppen dürfen
in `@active(...)`, `@lens(...)` und `@lens=` gemeinsam mit einzelnen Linsen
stehen. Der Compiler ersetzt sie in Quellreihenfolge durch ihre konkreten
Linsen und entfernt dabei Überschneidungen. Linsengruppen enthalten
ausschließlich existierende Linsen, keine weiteren Linsengruppen.

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
weggelassen. Eine optionale ID in `G id:` oder `P id:` ersetzt nur den jeweiligen
`<titel>`-Teil. Sie muss ein kleingeschriebener Bezeichner aus Buchstaben,
Ziffern und Unterstrichen sein. Ergibt sich weiterhin eine Kollision, bricht die
Kompilierung ab.

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
