import type {
    AttributeValue,
    DateTimeValue,
    Definitions,
    DurationEditor,
    DurationUnit,
    DurationValue,
    EditorDefinition,
    ItemKind,
    SnomedCoding,
    TextDefinition,
    ValueDefinition,
} from "./textblocktypes.js";

const durationLabels: Record<DurationUnit, [string, string]> = {
    minute: ["Minute", "Minuten"],
    hour: ["Stunde", "Stunden"],
    day: ["Tag", "Tagen"],
    week: ["Woche", "Wochen"],
    month: ["Monat", "Monaten"],
    year: ["Jahr", "Jahren"],
};

export type AttributePlaceholder = {
    id: string;
    required: boolean;
    start: number;
    end: number;
};

export const attributePlaceholders = (text: string): AttributePlaceholder[] =>
    [...text.matchAll(/\{:\s*([a-zA-Z0-9_-]+)\s*(\*)?\s*:\}/g)].map(
        (match) => ({
            id: match[1],
            required: match[2] === "*",
            start: match.index,
            end: match.index + match[0].length,
        }),
    );

export const emptyDefinitions = (): Definitions => ({
    groups: {},
    phrases: {},
    sets: {},
    editors: {},
});

export const parseValue = (
    value: TextDefinition | ValueDefinition,
): { text: string; coding?: SnomedCoding; kind?: ItemKind } => {
    if (typeof value !== "string") {
        if (value.snomed === undefined || value.snomed === "") {
            return {
                ...parseValue(value.text),
                ...("kind" in value ? { kind: value.kind } : {}),
            };
        }

        if (/^\d{6,18}$/.test(value.snomed)) {
            return {
                text: value.text,
                coding: {
                    system: "http://snomed.info/sct",
                    code: value.snomed,
                },
                ...("kind" in value ? { kind: value.kind } : {}),
            };
        }

        return {
            text: value.text,
            coding: {
                system: "http://snomed.info/sct",
                expression: value.snomed,
            },
            ...("kind" in value ? { kind: value.kind } : {}),
        };
    }

    const match = value.match(/^(\d{6,18})\|([^|]+)\|([\s\S]*)$/);
    if (match === null) {
        return { text: value };
    }

    return {
        text: match[3],
        coding: {
            system: "http://snomed.info/sct",
            code: match[1],
            display: match[2],
        },
    };
};

export const deSCTIDText = (text: string): string => parseValue(text).text;

export const getSCTIDFromText = (text: string): string =>
    parseValue(text).coding?.code ?? "";

const durationUnits = (editor: DurationEditor): DurationUnit[] =>
    editor.units ?? ["minute", "hour", "day", "week", "month", "year"];

export const editorDefaultValue = (
    editor: EditorDefinition,
): AttributeValue | undefined => {
    if (editor.type === "choice") {
        return editor.default;
    }
    if (editor.type === "number") {
        return editor.default;
    }
    if (editor.type === "duration") {
        return {
            amount: 1,
            unit: editor.defaultUnit ?? durationUnits(editor)[0],
            anchor: new Date().toISOString(),
        };
    }
    if (editor.type === "datetime" && editor.default === "now") {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60_000;
        return dateTimeValue(new Date(now.valueOf() - offset).toISOString().slice(0, 16));
    }
    return undefined;
};

export const dateTimeValue = (local: string): DateTimeValue => {
    const parsed = new Date(local);
    return {
        local,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        instant: Number.isNaN(parsed.valueOf()) ? "" : parsed.toISOString(),
    };
};

export const formatAttribute = (
    editor: EditorDefinition,
    value?: AttributeValue,
): string => {
    const prefix = "prefix" in editor ? (editor.prefix ?? "") : "";

    if (editor.type === "choice") {
        const selected = typeof value === "string" ? value : editor.default;
        return selected === undefined
            ? editor.label ?? "…"
            : parseValue(editor.options[selected] ?? selected).text;
    }

    if (editor.type === "number") {
        const number = typeof value === "number" ? value : editor.default;
        return `${prefix}${number ?? "…"}${editor.suffix ?? ""}`;
    }

    if (editor.type === "duration") {
        if (!isDurationValue(value)) {
            return `${prefix}${editor.label ?? "…"}`;
        }
        const labels = durationLabels[value.unit];
        const unit = value.amount === 1 ? labels[0] : labels[1];
        return `${prefix}${value.amount} ${unit}`;
    }

    if (editor.type === "date") {
        if (typeof value !== "string" || value === "") {
            return `${prefix}${editor.label ?? "…"}`;
        }
        const parsed = new Date(`${value}T00:00:00`);
        const date = Number.isNaN(parsed.valueOf())
            ? value
            : new Intl.DateTimeFormat("de-DE").format(parsed);
        return `${prefix}${date}`;
    }

    if (editor.type === "datetime") {
        if (!isDateTimeValue(value) || value.instant === "") {
            return `${prefix}${editor.label ?? "…"}`;
        }
        const parsed = new Date(value.instant);
        const dateTime = new Intl.DateTimeFormat("de-DE", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(parsed);
        return `${prefix}${dateTime}`;
    }

    const text = typeof value === "string" ? value : "";
    return `${prefix}${text || editor.placeholder || editor.label || "…"}`;
};

export const isDurationValue = (
    value: AttributeValue | undefined,
): value is DurationValue =>
    typeof value === "object" &&
    value !== null &&
    "amount" in value &&
    "unit" in value &&
    "anchor" in value &&
    typeof value.amount === "number" &&
    typeof value.unit === "string" &&
    typeof value.anchor === "string";

export const isDateTimeValue = (
    value: AttributeValue | undefined,
): value is DateTimeValue =>
    typeof value === "object" &&
    value !== null &&
    "local" in value &&
    "timeZone" in value &&
    "instant" in value &&
    typeof value.local === "string" &&
    typeof value.timeZone === "string" &&
    typeof value.instant === "string";

export const hasAttributeValue = (
    value: AttributeValue | undefined,
): value is AttributeValue => {
    if (value === undefined) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (typeof value === "number") return Number.isFinite(value);
    if (isDurationValue(value)) return value.amount > 0;
    return isDateTimeValue(value) && value.local !== "" && value.instant !== "";
};

export const clampNumber = (
    value: number,
    min?: number,
    max?: number,
): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));

export const resolvedStart = (value: DurationValue): string => {
    const date = new Date(value.anchor);
    if (Number.isNaN(date.valueOf())) {
        return "";
    }

    if (value.unit === "month") {
        date.setUTCMonth(date.getUTCMonth() - value.amount);
    } else if (value.unit === "year") {
        date.setUTCFullYear(date.getUTCFullYear() - value.amount);
    } else {
        const minutes: Record<Exclude<DurationUnit, "month" | "year">, number> = {
            minute: 1,
            hour: 60,
            day: 60 * 24,
            week: 60 * 24 * 7,
        };
        date.setTime(date.getTime() - value.amount * minutes[value.unit] * 60_000);
    }
    return date.toISOString();
};
