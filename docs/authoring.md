# Definitionen schreiben

Diese Anleitung beschreibt den üblichen Ablauf. Die vollständige Syntax steht
in der [`.pt`-Referenz](textblock-format.md).

## Grundregel

Die `.pt`-Datei ist die Quelle; das gleichnamige JSON ist ein Buildprodukt.

```text
app/data/ankunft.pt  --Compiler-->  app/data/ankunft.json
```

Nach einer Änderung:

```bash
make compile
make check
```

Danach wird das betroffene Verhalten im Browser geprüft. Insbesondere
Vorschläge, erforderliche Eingaben, Zurücksetzen und Touchbedienung können nicht
allein anhand des erzeugten JSON beurteilt werden.

## Kleines Paket anlegen

```pt
N: kreislauf
I: gemeinsam

E rekap: number label="Sekunden" suffix=" s" min=0 max=30 step=1

G @root @reset: Kreislauf
  P: Haut => Haut rosig|n* / Haut blass|a / Haut zyanotisch|a
  P: Rekapillarisierungszeit => Rekapillarisierungszeit {:sekunden=rekap*:}|-
  P: Weitere Kreislaufauffälligkeit => {:freitext*:}|a
```

`N:` ist zugleich Paketname, Dateiname und ID der Wurzelgruppe. Der Compiler
erzeugt alle weiteren IDs aus Paketname, Typ und sichtbarer deutscher
Bezeichnung. IDs werden daher normalerweise nicht geschrieben.

## Einen Editor ergänzen

```pt
E rekap: number label="Sekunden" suffix=" s" min=0 max=30 step=1
```

Die Phrase bindet ihn über einen frei gewählten deutschen Attributnamen ein:

```pt
P: Rekapillarisierungszeit => Rekapillarisierungszeit {:sekunden=rekap*:}|-
```

Das Sternchen macht das Attribut erforderlich. Ohne Sternchen ist es optional.
Gemeinsamer Freitext benötigt nur `{:freitext*:}`, wenn `gemeinsam` importiert
ist.

## Einen Vorschlag auslösen

Referenziere vorzugsweise den Titel links von `=>`:

```pt
P: Blutungslokalisation => Blutung {:ort=gemeinsam.blutungslokalisation*:} {:seite=gemeinsam.seite*:}|a*
C blutung_vorhanden: Blutungslokalisation
P<blutung_vorhanden>: Kompression|i
```

Die Bedingung wird erst aktiv, wenn die Phrase aufgenommen und alle
erforderlichen Attribute ausgefüllt sind. Ein Verweis auf den Phrasentitel
umfasst alle Werte der Phrase.

Soll nur ein bestimmter Wert einer mehrwertigen Phrase auslösen, wird sein
vollständiger Quelltext verwendet:

```pt
P: Atemgeräusch => Atemgeräusch seitengleich|n* / Atemgeräusch {:seite=gemeinsam.seite*:}|a
C atemgeraeusch_auffaellig: Atemgeräusch {:seite=gemeinsam.seite*:}
```

Der Inhalt eines Editors kann noch nicht als Prädikat verwendet werden. Eine
Bedingung wie `seite = links` oder `NRS >= 5` ist eine
[offene Grenze](open-boundaries.md).

## Pakete zusammensetzen

Große Definitionen werden über Importe klein gehalten:

```pt
N: abcde
I: x, a, b

G @root @summary @reset: ABCDE
  U: x, a, b
```

`I:` lädt Abhängigkeiten rekursiv. `U:` ordnet deren Wurzelgruppen in der
angegebenen Reihenfolge ein. Definitionen werden nicht kopiert oder
überschrieben; doppelte IDs und Importzyklen sind Fehler.

## Einen großen Auswahlkatalog pflegen

Ein großer, durchsuchbarer Auswahlvorrat wird als Wertkatalog im selben
`.pt`-Format gepflegt. Ein Wert bleibt dabei mit seinen Suchbegriffen,
Kodierungen und fachlichen Zuordnungen zusammen:

```pt
L neurologie: Neurologie

V schwindel: Schwindel|a
  @sct=404640003[Dizziness]
  @alias=Drehschwindel; Vertigo; Benommenheit
  @cedis=403[Schwindel] equivalent
  @lens=neurologie
```

Die Quellreihenfolge dient als einfache Rangfolge. Ist eine Häufigkeit
hinreichend bekannt, stehen häufige Werte zuerst; eine zusätzliche numerische
Gewichtung ist nicht erforderlich. Linsen bestimmen nur die kompakte
Vorauswahl. Werte ohne passende Linse bleiben über ihre Bezeichnung und
Aliase auffindbar.

CEDIS-Code, CEDIS-Originalbezeichnung und Beziehung werden direkt am Wert
geführt. Der Compiler gleicht alle drei Angaben mit dem gebündelten Katalog ab
und verlangt für den Symptomkatalog mindestens eine Zuordnung zu jedem
enthaltenen CEDIS-PCL-Code. Zusätzliche Werte sind ausdrücklich zulässig.

Der Symptomkatalog bleibt zunächst in einer Datei, damit Reihenfolge und
Zuordnungen gemeinsam prüfbar sind. Eine spätere Aufteilung muss die globale
Reihenfolge ausdrücklich erhalten; die Datei wird daher nicht vorzeitig nach
Fachgebiet oder CEDIS-Kapitel zerlegt.

## Dokumente zusammenstellen

`documents.pt` bestimmt die auf der Seite auswählbaren Dokumente und deren
Plug-in-Reihenfolge:

```pt
T: dokumente

W: updates updates label="Neuigkeiten"

D*: Rettungsdienst
  B: textblock ankunft controls=false
  B: textblock anamnese controls=false
  B: textblock abcde controls=false
```

`D*` markiert das Standarddokument. Textblock-IDs müssen auf ein Paket mit
gleichnamiger Wurzelgruppe verweisen.

`W:` registriert ein globales Werkzeug getrennt von den auszugebenden
Dokumentblöcken. Werkzeuge werden daher nicht von **Dokument kopieren** oder
**Daten kopieren** erfasst.

## Einen additiven Rechner ergänzen

Punktwerte bleiben direkt an den ohnehin sichtbaren Auswahlwerten:

```pt
E summe: number label="Summe" min=2 max=4 step=1

G @score(id=beispiel,label="Beispiel berechnen",target="Gesamt",attribute=wert): Beispiel
  P: Kriterium A => hoch @points=2|n / niedrig @points=1|a
  P: Kriterium B => hoch @points=2|n / niedrig @points=1|a
  P: Gesamt => Gesamt {:wert=summe*:}|-
```

Alle Werte einer Kriterienphrase benötigen Punkte; eine teilweise markierte
Phrase ist ein Compilerfehler. Die Zielphrase muss direkt in der Gruppe liegen,
genau einen Wert besitzen und das angegebene Zahlenattribut verwenden.

Die fachliche Prüfung einer Score-Definition bleibt Teil der Inhaltspflege. Die
mitgelieferten Definitionen wurden anhand der offiziellen
[Glasgow-Coma-Scale-Dokumentation](https://www.glasgowcomascale.org/) und der
gemeinsamen [APGAR-Stellungnahme von ACOG und AAP](https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2015/10/the-apgar-score)
geprüft.

## Kollisionsfehler

Abgeleitete IDs sind global eindeutig und enthalten deutsche Typteile:

```text
ankunft_gruppe_auffindeort
ankunft_eintrag_position
ankunft_eintrag_position_wert_stehend
```

Erzeugen zwei sichtbare Bezeichnungen dieselbe ID, bricht der Compiler mit
Datei und Zeile ab. Für den Moment wird die Bezeichnung präzisiert; explizite
ID-Ausnahmen sind bewusst noch nicht Teil der Sprache.
