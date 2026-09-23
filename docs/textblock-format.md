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

Bedingungen können einen Katalogwert stabil über `paket.wert` referenzieren:

```pt
C schmerz: symptome.brustschmerz / symptome.bauchschmerz
P<!symptome.fieber>: kein Fieber|n
```

Verweist eine Bedingung stattdessen auf den Titel einer Phrase, die den lokalen
Katalog ihres Pakets verwendet, umfasst sie sämtliche Werte dieses Katalogs.
Damit können gemeinsame Folgefragen nach jeder Katalogauswahl sichtbar werden.
Für importierte Kataloge sind weiterhin explizite `paket.wert`-Referenzen nötig.

Der Compiler fügt die Katalogwerte in die Laufzeitphrase ein. Auswahl,
Wiederholung, Bedingungen und Ausgabe verwenden danach das normale
Textblock-Zustandsmodell.

## Gruppen

```pt
G @root @reset: Untersuchung
  G: Befunde
    G @collapsed: Untergruppe|n
```

Eine Gruppe kann folgende voneinander unabhängige Annotationen tragen:

| Annotation | Wirkung |
|---|---|
| `@root` | Wurzel des Pakets |
| `@reset` | separat zurücksetzbar |
| `@summary` | fasst auffällige aufgenommene Einträge zusammen |
| `@collapsed` | initial visuell eingeklappt |
| `@inline` | setzt die Überschrift platzsparend neben den Gruppeninhalt |
| `@autocollapse` | markiert eine verschachtelte Inline-Gruppe für die reduzierte Akkordeonansicht |
| `@inactive` | initial nicht aktiv; bleibt als Vorschlag sichtbar |
| `@repeat(...)` | wiederholbare Gruppe |
| `@score(...)` | erzeugt einen additiven Rechner aus markierten Werten |

Der optionale Gruppentyp verwendet dieselben Kurzzeichen wie Werte, zum
Beispiel `Orientierung|n` oder `Blutung|a`.

`@inline` verändert ausschließlich die Darstellung; Auswahlzustand, Ausgabe
und Gruppeneinschluss bleiben unverändert. Bei Inline-Gruppen sowie bei
eingeklappten Gruppen stehen Zurücksetzen und gegebenenfalls Entfernen als
kompakte Symbolschaltflächen `↺` und `×` im Kopf. Sie behalten vollständige
zugängliche Namen und einen Tooltip; ein `<abbr>` wird nicht verwendet, weil
die Symbole keine Abkürzungen sind.

Direkt verschachtelte Inline-Gruppen werden in denselben umbrechenden Zeilenfluss
eingefügt. Eine verschachtelte Gruppe ohne `@inline` beginnt dagegen auf einer
eigenen Zeile. Damit kann die Quelldefinition ausdrücklich zwischen vollständig
fortlaufender und blockweiser Darstellung wählen. Untergruppen und
zusammenhängende Phrasenabschnitte behalten dabei ihre Reihenfolge aus der
`.pt`-Quelle; eine Inline-Gruppe wird nicht gesammelt hinter die Phrasen ihrer
Elterngruppe verschoben. Innerhalb eines solchen Phrasenabschnitts stehen in die
Ausgabe aufgenommene Phrasen vor noch nicht aufgenommenen Phrasen. Die jeweilige
Quellreihenfolge innerhalb beider Zustände bleibt stabil.

Inline-Überschriften sind bewusst zurückhaltend. Direkt verschachtelte
Inline-Gruppen erhalten eine schmale, an beiden Enden begrenzte Unterlinie, die
ihren Inhalt im fortlaufenden Zeilenfluss zusammenfasst. Enthält eine Gruppe
mindestens eine in die Ausgabe aufgenommene Phrase, wird auch ihre Überschrift
hervorgehoben. Dies gilt ebenso für eingeklappte Gruppen, deren Standardwerte
bereits in der Ausgabe stehen.

`@autocollapse` ist eine optionale Ergänzung für eine direkt in eine andere
`@inline`-Gruppe eingebettete Gruppe und erfordert zusätzlich `@inline` und
`@collapsed`. Solche Untergruppen verwenden keinen individuellen Zeitgeber,
sondern bilden ein Akkordeon: Beim Öffnen werden offene, einklappbare
Inline-Geschwister geschlossen. Dadurch kann eine Auswahl nicht zeitversetzt
ein anderes Bedienelement unter dem Finger verschieben.

Im eingeklappten Zustand verschwinden nur die noch nicht aufgenommenen
Auswahlmöglichkeiten. Bereits aufgenommene Phrasen bleiben sichtbar und
bearbeitbar. Enthalten sie weitere Untergruppen, bleiben deren Überschriften als
Bedienelemente in ihrer Hierarchie erhalten und öffnen den vollständigen Pfad
zur Auswahl. Diese reduzierte Darstellung gilt bei ausgeschalteter globaler
Automatik nur für `@autocollapse`, nicht allgemein für `@collapsed`.

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
| `empty` | Titel der Phrase, die ohne Instanz den leeren/normalen Zustand vertritt |

Jede Instanz erhält eigenen Zustand und eigene Attribute. Verschachtelte
wiederholbare Gruppen werden derzeit nicht unterstützt.

Die sichtbare Hinzufügen-Schaltfläche verwendet analog zu einer inaktiven
Gruppe den kompakten Gruppentitel mit `+`, beispielsweise `Schmerz +`. Der
ausführlichere `add`-Text bleibt als zugänglicher Name und Tooltip erhalten.

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
Phrase. Erforderliche Attribute werden zuvor abgeschlossen. Eingeklappte oder
inaktive Gruppen werden übersprungen, bis sie geöffnet beziehungsweise
aktiviert werden. Ein Zurücksetzen startet die Reihenfolge erneut.

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
entfällt diese Animation.

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
