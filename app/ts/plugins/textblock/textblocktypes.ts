export type SnomedCoding = {
    system: "http://snomed.info/sct";
    code?: string;
    expression?: string;
    display?: string;
};

export type ItemKind = "normal" | "abnormal" | "intervention" | "neutral";

export type CedisMapping = {
    code: string;
    display: string;
    relation: "equivalent" | "related" | "broader" | "narrower";
};

export type TextDefinition =
    | string
    | {
          text: string;
          snomed?: string;
          snomedDisplay?: string;
      };

export type ValueDefinition = {
    text: string;
    snomed?: string;
    snomedDisplay?: string;
    kind: ItemKind;
    points?: number;
    aliases?: string[];
    search?: string;
    lenses?: string[];
    tags?: string[];
    cedis?: CedisMapping[];
    freeText?: boolean;
};

export type ValueCatalogDefinition = {
    values: Record<string, ValueDefinition>;
    attributes?: Record<string, string>;
};

export type ConditionDefinition = {
    values: string[];
    negated: boolean;
};

export type PhraseDefinition = {
    title: string;
    default: string | "" | null;
    values: Record<string, ValueDefinition>;
    prompt?: boolean;
    suggestions?: Record<string, string | null>;
    condition?: ConditionDefinition & { suggestion: string | null };
    attributes?: Record<string, string>;
    note?: string;
    kind?: ItemKind;
    catalog?: string;
};

export type RepeatableDefinition = {
    initial?: number;
    add: string;
    empty?: string;
};

export type ScoreOptionDefinition = {
    valueId: string;
    text: string;
    kind: ItemKind;
    points: number;
};

export type ScoreCriterionDefinition = {
    phraseId: string;
    title: string;
    options: ScoreOptionDefinition[];
};

export type ScoreDefinition = {
    id: string;
    label: string;
    minimum: number;
    maximum: number;
    criteria: ScoreCriterionDefinition[];
    target: {
        phraseId: string;
        valueId: string;
        attributeId: string;
    };
};

export type GroupItemDefinition = {
    type: "phrase" | "group";
    id: string;
};

export type GroupDefinition = {
    title: TextDefinition;
    items: GroupItemDefinition[];
    sets?: string[];
    default?: boolean;
    activeLenses?: string[];
    content?: string;
    note?: string;
    kind?: ItemKind;
    summary?: boolean;
    reset?: boolean;
    subgroups?: "flow" | "break";
    autoCompact?: boolean;
    reveal?: ConditionDefinition | "initial";
    repeatable?: RepeatableDefinition;
    condition?: ConditionDefinition;
    score?: ScoreDefinition;
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

export type DateTimeEditor = {
    type: "datetime";
    label?: string;
    prefix?: string;
    default?: "now";
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
    | DateTimeEditor
    | TextEditor;

export type PackageDefinition = {
    version: 2;
    imports?: string[];
    groups: Record<string, GroupDefinition>;
    phrases: Record<string, PhraseDefinition>;
    sets?: Record<string, SetDefinition>;
    editors?: Record<string, EditorDefinition>;
    catalogs?: Record<string, ValueCatalogDefinition>;
};

export type Definitions = {
    groups: Record<string, GroupDefinition>;
    phrases: Record<string, PhraseDefinition>;
    sets: Record<string, SetDefinition>;
    editors: Record<string, EditorDefinition>;
    catalogs: Record<string, ValueCatalogDefinition>;
};

export type DurationValue = {
    amount: number;
    unit: DurationUnit;
    anchor: string;
};

export type DateTimeValue = {
    local: string;
    timeZone: string;
    instant: string;
};

export type AttributeValue = string | number | DurationValue | DateTimeValue;

export type PhraseOverride = {
    included: boolean;
    valueId: string | null;
};

export type ScopeState = {
    activeSets: string[];
    completedPrompts: string[];
    phraseOverrides: Record<string, PhraseOverride>;
    groupOverrides: Record<string, boolean>;
    attributes: Record<string, Record<string, AttributeValue>>;
    acceptedProvenance: Record<string, string[]>;
};

export type DocumentState = ScopeState & {
    groupInstances: Record<string, string[]>;
    instanceStates: Record<string, ScopeState>;
};

export type PhraseSource = "default" | "set" | "suggestion" | "user";

export type ResolvedPart =
    | { type: "text"; text: string }
    | {
          type: "attribute";
          id: string;
          editorId: string;
          text: string;
          required: boolean;
          value?: AttributeValue;
      };

export type ResolvedPhrase = {
    key: string;
    id: string;
    instanceId?: string;
    title: string;
    valueId: string | null;
    text: string;
    parts: ResolvedPart[];
    visible: boolean;
    included: boolean;
    effectiveIncluded: boolean;
    source: PhraseSource;
    provenance: string[];
    touched: boolean;
    attributes: Record<string, AttributeValue>;
    coding?: SnomedCoding;
    kind: ItemKind;
};

export type ResolvedDocument = {
    phrases: Record<string, ResolvedPhrase>;
    groups: Record<
        string,
        {
            enabled: boolean;
            conditionMet: boolean;
            included: boolean;
            suggested: boolean;
        }
    >;
};

export type StructuredItem = {
    id: string;
    instanceId?: string;
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

export type StructuredSummaryItem = Pick<
    StructuredItem,
    | "id"
    | "instanceId"
    | "valueId"
    | "text"
    | "kind"
    | "source"
    | "provenance"
    | "attributes"
>;

export type StructuredDocument = {
    version: 1;
    root: string;
    text: string;
    items: StructuredItem[];
    suggestions: StructuredSummaryItem[];
    summaries: Array<{
        groupId: string;
        title: string;
        items: StructuredSummaryItem[];
    }>;
};
