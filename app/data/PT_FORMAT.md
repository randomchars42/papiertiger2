# `.pt`-Kurzformat

Die `.pt`-Dateien sind die Quellen. `make compile` erzeugt daraus die
gleichnamigen JSON-Dateien; generiertes JSON wird nicht von Hand geändert.

## Textblöcke

```pt
N: beispiel
I: gemeinsam

E wert: number label="Wert" min=0 max=10 step=1
C auffaellig: auffälliger Befund / anderer auffälliger Befund

G @root @reset: Beispiel
  P: Befund => unauffällig|n* / auffälliger Befund|a
  P<auffaellig>: Maßnahme|i
  P: Messwert => Wert {:zahl=wert*:}|-
  P: Ergänzung => {:freitext*:}|-
```

- `N:` setzt den Paketnamen und muss dem Dateinamen entsprechen.
- `I:` importiert Pakete rekursiv. `U:` fügt die Wurzelgruppe eines importierten
  Pakets als Untergruppe ein.
- `G:` definiert eine Gruppe. Verfügbar sind `@root`, `@reset`, `@summary`,
  `@collapsed`, `@inactive` und
  `@repeat(initial=0,add="…",empty="Phrasentitel")`.
- `P:` definiert einen Eintrag. Werte stehen nach `=>` und werden mit ` / `
  getrennt. `P<Bedingung>:` macht den Eintrag zu einem Vorschlag; Bedingungen
  beziehen sich auf sichtbare Eintrags- oder Werttexte.
- `C:` fasst mehrere Bedingungen unter einem kurzen lokalen Namen zusammen.
- `E:` definiert eine Eingabe vom Typ `text`, `number`, `duration`, `date`,
  `datetime` oder `choice`. Auswahlwerte stehen ebenfalls nach `=>`.
- `S:` definiert eine Vorgabe; eingerückte Zeilen verwenden
  `Eintragstitel = Werttext`.
- `|n`, `|a`, `|i` und `|-` bedeuten normal, auffällig, Intervention und neutral.
  Ein angehängtes `*` markiert den Standardwert.
- `@sct=248553004` hinter einem Wert ergänzt optional die SNOMED-CT-Kodierung.
- `{:name*:}` ist eine erforderliche Eingabe, `{:name:}` eine optionale.
  `{:name=editor*:}` wählt einen lokalen Editor und
  `{:name=paket.editor*:}` einen importierten Editor. `{:freitext*:}` verwendet
  automatisch `gemeinsam.freitext`.

IDs werden aus Paketname, Typ und sichtbarer deutscher Bezeichnung abgeleitet,
zum Beispiel `ankunft_eintrag_position` und
`ankunft_eintrag_position_wert_stehend`. Kollisionen brechen die Übersetzung ab.

## Dokumente

`documents.pt` verwendet einen kleinen eigenen Abschnitt:

```pt
T: dokumente

D*: Rettungsdienst
  B: textblock ankunft controls=false

D: Erstbefund
  B: textblock abcde controls=false
```

`D*` ist das Standarddokument. Jeder `B:`-Eintrag enthält Plug-in, Definitions-ID
und optionale Parameter.
