export type SnomedCoding = {
    system: "http://snomed.info/sct";
    code?: string;
    expression?: string;
    display?: string;
};

export type ItemKind = "normal" | "abnormal" | "intervention" | "neutral";

export type TextDefinition =
    | string
    | {
          text: string;
          snomed?: string;
      };

export type ValueDefinition = {
    text: string;
    snomed?: string;
    kind: ItemKind;
};

export type PhraseDefinition = {
    title: string;
    default: string | "" | null;
    values: Record<string, ValueDefinition>;
    suggestions?: Record<string, string>;
    attributes?: Record<string, string>;
    note?: string;
    kind?: ItemKind;
};

export type GroupDefinition = {
    title: TextDefinition;
    children?: string[];
    phrases?: string[];
    sets?: string[];
    default?: boolean;
    content?: string;
    note?: string;
    kind?: ItemKind;
    summary?: boolean;
    reset?: boolean;
};

export type SetDefinition = {
    title: string;
    values: Record<string, string | null>;
    kind?: ItemKind;
};

export type ChoiceEditor = {
    type: "choice";
    label?: string;
    options: Record<string, ValueDefinition>;
    default?: string;
};

export type NumberEditor = {
    type: "number";
    label?: string;
    prefix?: string;
    suffix?: string;
    min?: number;
    max?: number;
    step?: number;
    default?: number;
};

export type DurationUnit =
    | "minute"
    | "hour"
    | "day"
    | "week"
    | "month"
    | "year";

export type DurationEditor = {
    type: "duration";
    label?: string;
    prefix?: string;
    units?: DurationUnit[];
    defaultUnit?: DurationUnit;
};

export type DateEditor = {
    type: "date";
    label?: string;
    prefix?: string;
};

export type TextEditor = {
    type: "text";
    label?: string;
    prefix?: string;
    placeholder?: string;
};

export type EditorDefinition =
    | ChoiceEditor
    | NumberEditor
    | DurationEditor
    | DateEditor
    | TextEditor;

export type PackageDefinition = {
    version: 2;
    imports?: string[];
    groups: Record<string, GroupDefinition>;
    phrases: Record<string, PhraseDefinition>;
    sets?: Record<string, SetDefinition>;
    editors?: Record<string, EditorDefinition>;
};

export type Definitions = {
    groups: Record<string, GroupDefinition>;
    phrases: Record<string, PhraseDefinition>;
    sets: Record<string, SetDefinition>;
    editors: Record<string, EditorDefinition>;
};

export type DurationValue = {
    amount: number;
    unit: DurationUnit;
    anchor: string;
};

export type AttributeValue = string | number | DurationValue;

export type PhraseOverride = {
    included: boolean;
    valueId: string | null;
};

export type DocumentState = {
    activeSets: string[];
    phraseOverrides: Record<string, PhraseOverride>;
    groupOverrides: Record<string, boolean>;
    attributes: Record<string, Record<string, AttributeValue>>;
};

export type PhraseSource = "default" | "set" | "suggestion" | "user";

export type ResolvedPart =
    | { type: "text"; text: string }
    | {
          type: "attribute";
          id: string;
          editorId: string;
          text: string;
          value?: AttributeValue;
      };

export type ResolvedPhrase = {
    id: string;
    title: string;
    valueId: string | null;
    text: string;
    parts: ResolvedPart[];
    visible: boolean;
    included: boolean;
    source: PhraseSource;
    provenance: string[];
    touched: boolean;
    attributes: Record<string, AttributeValue>;
    coding?: SnomedCoding;
    kind: ItemKind;
};

export type ResolvedDocument = {
    phrases: Record<string, ResolvedPhrase>;
};

export type StructuredItem = {
    id: string;
    valueId: string | null;
    text: string;
    kind: ItemKind;
    source: PhraseSource;
    provenance: string[];
    attributes: Record<
        string,
        AttributeValue | (DurationValue & { resolvedStart: string })
    >;
    coding?: SnomedCoding;
};

export type StructuredDocument = {
    version: 1;
    root: string;
    text: string;
    items: StructuredItem[];
    suggestions: Array<
        Pick<StructuredItem, "id" | "valueId" | "text" | "kind">
    >;
    summaries: Array<{
        groupId: string;
        title: string;
        items: Array<Pick<StructuredItem, "id" | "valueId" | "text" | "kind">>;
    }>;
};
