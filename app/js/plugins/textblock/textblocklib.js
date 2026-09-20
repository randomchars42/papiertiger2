const durationLabels = {
    minute: ["Minute", "Minuten"],
    hour: ["Stunde", "Stunden"],
    day: ["Tag", "Tagen"],
    week: ["Woche", "Wochen"],
    month: ["Monat", "Monaten"],
    year: ["Jahr", "Jahren"],
};
export const emptyDefinitions = () => ({
    groups: {},
    phrases: {},
    sets: {},
    editors: {},
});
export const parseValue = (value) => {
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
export const deSCTIDText = (text) => parseValue(text).text;
export const getSCTIDFromText = (text) => parseValue(text).coding?.code ?? "";
const durationUnits = (editor) => editor.units ?? ["minute", "hour", "day", "week", "month", "year"];
export const editorDefaultValue = (editor) => {
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
    return undefined;
};
export const formatAttribute = (editor, value) => {
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
    const text = typeof value === "string" ? value : "";
    return `${prefix}${text || editor.placeholder || editor.label || "…"}`;
};
export const isDurationValue = (value) => typeof value === "object" &&
    value !== null &&
    typeof value.amount === "number" &&
    typeof value.unit === "string" &&
    typeof value.anchor === "string";
export const hasAttributeValue = (value) => {
    if (value === undefined)
        return false;
    if (typeof value === "string")
        return value.trim() !== "";
    if (typeof value === "number")
        return Number.isFinite(value);
    return isDurationValue(value) && value.amount > 0;
};
export const clampNumber = (value, min, max) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
export const resolvedStart = (value) => {
    const date = new Date(value.anchor);
    if (Number.isNaN(date.valueOf())) {
        return "";
    }
    if (value.unit === "month") {
        date.setUTCMonth(date.getUTCMonth() - value.amount);
    }
    else if (value.unit === "year") {
        date.setUTCFullYear(date.getUTCFullYear() - value.amount);
    }
    else {
        const minutes = {
            minute: 1,
            hour: 60,
            day: 60 * 24,
            week: 60 * 24 * 7,
        };
        date.setTime(date.getTime() - value.amount * minutes[value.unit] * 60_000);
    }
    return date.toISOString();
};
