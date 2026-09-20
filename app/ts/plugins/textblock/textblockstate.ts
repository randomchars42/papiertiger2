import {
    formatAttribute,
    hasAttributeValue,
    isDurationValue,
    parseValue,
    resolvedStart,
} from "./textblocklib.js";
import type {
    AttributeValue,
    Definitions,
    DocumentState,
    EditorDefinition,
    PackageDefinition,
    ResolvedDocument,
    ResolvedPart,
    ResolvedPhrase,
    StructuredDocument,
    StructuredItem,
} from "./textblocktypes.js";

export const createDocumentState = (): DocumentState => ({
    activeSets: [],
    phraseOverrides: {},
    groupOverrides: {},
    attributes: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export const isPackage = (value: unknown): value is PackageDefinition => {
    if (!isRecord(value) || value.version !== 2) {
        return false;
    }
    return (
        isRecord(value.groups) &&
        isRecord(value.phrases) &&
        (value.imports === undefined ||
            (Array.isArray(value.imports) &&
                value.imports.every((id) => typeof id === "string" && id !== "")))
    );
};

const mergeRecord = <T>(
    target: Record<string, T>,
    source: Record<string, T>,
    kind: string,
): void => {
    for (const [id, definition] of Object.entries(source)) {
        if (id in target) {
            throw new Error(`Duplicate ${kind} id "${id}"`);
        }
        target[id] = definition;
    }
};

export const mergePackage = (
    definitions: Definitions,
    packageDefinition: PackageDefinition,
): void => {
    mergeRecord(definitions.groups, packageDefinition.groups, "group");
    mergeRecord(definitions.phrases, packageDefinition.phrases, "phrase");
    mergeRecord(definitions.sets, packageDefinition.sets ?? {}, "set");
    mergeRecord(definitions.editors, packageDefinition.editors ?? {}, "editor");
};

export const validateDefinitions = (definitions: Definitions): void => {
    const valueOwners = new Map<string, string>();
    const itemKinds = new Set(["normal", "abnormal", "intervention", "neutral"]);

    for (const [id, phrase] of Object.entries(definitions.phrases)) {
        if (typeof phrase.title !== "string" || !isRecord(phrase.values)) {
            throw new Error(`Invalid phrase "${id}"`);
        }
        if (
            phrase.default !== "" &&
            phrase.default !== null &&
            !(phrase.default in phrase.values)
        ) {
            throw new Error(`Unknown default "${phrase.default}" in phrase "${id}"`);
        }
        if (phrase.kind !== undefined && !itemKinds.has(phrase.kind)) {
            throw new Error(`Invalid suggestion kind in phrase "${id}"`);
        }
        for (const [valueId, value] of Object.entries(phrase.values)) {
            if (
                !isRecord(value) ||
                typeof value.text !== "string" ||
                typeof value.kind !== "string" ||
                !itemKinds.has(value.kind)
            ) {
                throw new Error(
                    `Value "${valueId}" in phrase "${id}" needs text and kind`,
                );
            }
            const owner = valueOwners.get(valueId);
            if (owner !== undefined) {
                throw new Error(
                    `Value id "${valueId}" is used by both "${owner}" and "${id}"`,
                );
            }
            valueOwners.set(valueId, id);
        }
        for (const editorId of Object.values(phrase.attributes ?? {})) {
            if (!(editorId in definitions.editors)) {
                throw new Error(`Unknown editor "${editorId}" in phrase "${id}"`);
            }
        }
    }

    for (const [id, editor] of Object.entries(definitions.editors)) {
        if (editor.type !== "choice") continue;
        if (editor.default !== undefined && !(editor.default in editor.options)) {
            throw new Error(`Unknown default "${editor.default}" in editor "${id}"`);
        }
        for (const [optionId, option] of Object.entries(editor.options)) {
            if (
                !isRecord(option) ||
                typeof option.text !== "string" ||
                typeof option.kind !== "string" ||
                !itemKinds.has(option.kind)
            ) {
                throw new Error(
                    `Option "${optionId}" in editor "${id}" needs text and kind`,
                );
            }
        }
    }

    for (const [id, group] of Object.entries(definitions.groups)) {
        if (group.kind !== undefined && !itemKinds.has(group.kind)) {
            throw new Error(`Invalid kind in group "${id}"`);
        }
        for (const child of group.children ?? []) {
            if (!(child in definitions.groups)) {
                throw new Error(`Unknown child group "${child}" in group "${id}"`);
            }
        }
        for (const phrase of group.phrases ?? []) {
            if (!(phrase in definitions.phrases)) {
                throw new Error(`Unknown phrase "${phrase}" in group "${id}"`);
            }
        }
        for (const set of group.sets ?? []) {
            if (!(set in definitions.sets)) {
                throw new Error(`Unknown set "${set}" in group "${id}"`);
            }
        }
    }

    for (const [id, set] of Object.entries(definitions.sets)) {
        if (set.kind !== undefined && !itemKinds.has(set.kind)) {
            throw new Error(`Invalid kind in set "${id}"`);
        }
        for (const [phraseId, valueId] of Object.entries(set.values)) {
            const phrase = definitions.phrases[phraseId];
            if (phrase === undefined) {
                throw new Error(`Unknown phrase "${phraseId}" in set "${id}"`);
            }
            if (valueId !== null && !(valueId in phrase.values)) {
                throw new Error(`Unknown value "${valueId}" in set "${id}"`);
            }
        }
    }

    for (const [id, phrase] of Object.entries(definitions.phrases)) {
        for (const [trigger, valueId] of Object.entries(
            phrase.suggestions ?? {},
        )) {
            if (!valueOwners.has(trigger)) {
                throw new Error(`Unknown suggestion trigger "${trigger}" in "${id}"`);
            }
            if (!(valueId in phrase.values)) {
                throw new Error(`Unknown suggested value "${valueId}" in "${id}"`);
            }
        }
    }
};

const attributeParts = (
    text: string,
    phraseId: string,
    attributes: Record<string, string>,
    values: Record<string, AttributeValue>,
    editors: Record<string, EditorDefinition>,
): ResolvedPart[] => {
    const parts: ResolvedPart[] = [];
    const pattern = /\{:\s*([a-zA-Z0-9_-]+)\s*:\}/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > cursor) {
            parts.push({ type: "text", text: text.slice(cursor, match.index) });
        }
        const attributeId = match[1];
        const editorId = attributes[attributeId];
        const editor = editors[editorId];
        if (editor === undefined) {
            throw new Error(
                `Missing editor for attribute "${phraseId}.${attributeId}"`,
            );
        }
        const value = values[attributeId];
        parts.push({
            type: "attribute",
            id: attributeId,
            editorId,
            text: formatAttribute(editor, value),
            ...(value === undefined ? {} : { value }),
        });
        cursor = pattern.lastIndex;
    }

    if (cursor < text.length) {
        parts.push({ type: "text", text: text.slice(cursor) });
    }
    return parts.length === 0 ? [{ type: "text", text }] : parts;
};

const refreshPhraseText = (
    phrase: ResolvedPhrase,
    definitions: Definitions,
    state: DocumentState,
): void => {
    const definition = definitions.phrases[phrase.id];
    const selected =
        phrase.valueId === null ? undefined : definition.values[phrase.valueId];
    const parsed =
        selected === undefined ? { text: definition.title } : parseValue(selected);
    const attributes = state.attributes[phrase.id] ?? {};
    phrase.attributes = { ...attributes };
    phrase.parts = attributeParts(
        parsed.text,
        phrase.id,
        definition.attributes ?? {},
        attributes,
        definitions.editors,
    );
    phrase.text = phrase.parts.map((part) => part.text).join("");
    phrase.coding = parsed.coding;
    phrase.kind = parsed.kind ?? definition.kind ?? "neutral";
    if (
        phrase.included &&
        phrase.parts.some(
            (part) =>
                part.type === "attribute" && !hasAttributeValue(part.value),
        )
    ) {
        phrase.included = false;
    }
};

export const resolveDocument = (
    definitions: Definitions,
    state: DocumentState,
): ResolvedDocument => {
    const phrases: Record<string, ResolvedPhrase> = {};

    for (const [id, definition] of Object.entries(definitions.phrases)) {
        const defaultId = definition.default;
        phrases[id] = {
            id,
            title: definition.title,
            valueId: defaultId === "" || defaultId === null ? null : defaultId,
            text: definition.title,
            parts: [],
            visible: defaultId !== null,
            included: defaultId !== "" && defaultId !== null,
            source: "default",
            provenance: [],
            touched: false,
            attributes: {},
            kind: definition.kind ?? "neutral",
        };
    }

    for (const setId of state.activeSets) {
        const set = definitions.sets[setId];
        if (set === undefined) {
            continue;
        }
        for (const [phraseId, valueId] of Object.entries(set.values)) {
            if (state.phraseOverrides[phraseId] !== undefined) {
                continue;
            }
            const phrase = phrases[phraseId];
            phrase.valueId = valueId;
            phrase.visible = true;
            phrase.included = valueId !== null;
            phrase.source = "set";
            phrase.provenance = [setId];
        }
    }

    for (const [phraseId, override] of Object.entries(state.phraseOverrides)) {
        const phrase = phrases[phraseId];
        if (phrase === undefined) {
            continue;
        }
        phrase.valueId = override.valueId;
        phrase.visible = true;
        phrase.included = override.included && override.valueId !== null;
        phrase.source = "user";
        phrase.provenance = [phraseId];
        phrase.touched = true;
    }

    const activeValues = new Set(
        Object.values(phrases)
            .filter((phrase) => phrase.included && phrase.valueId !== null)
            .map((phrase) => phrase.valueId as string),
    );

    for (const [phraseId, definition] of Object.entries(definitions.phrases)) {
        if (
            state.phraseOverrides[phraseId] !== undefined ||
            phrases[phraseId].source === "set"
        ) {
            continue;
        }
        const matches = Object.entries(definition.suggestions ?? {}).filter(
            ([trigger]) => activeValues.has(trigger),
        );
        if (matches.length === 0) {
            continue;
        }
        const [, valueId] = matches[matches.length - 1];
        const phrase = phrases[phraseId];
        phrase.valueId = valueId;
        phrase.visible = true;
        phrase.included = false;
        phrase.source = "suggestion";
        phrase.provenance = matches.map(([source]) => source);
    }

    for (const phrase of Object.values(phrases)) {
        refreshPhraseText(phrase, definitions, state);
    }

    return { phrases };
};

export const isGroupEnabled = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
): boolean =>
    state.groupOverrides[groupId] ?? definitions.groups[groupId]?.default ?? true;

const collectIncludedPhraseIds = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
): string[] => {
    if (!isGroupEnabled(groupId, definitions, state)) {
        return [];
    }
    const group = definitions.groups[groupId];
    return [
        ...(group.phrases ?? []),
        ...(group.children ?? []).flatMap((child) =>
            collectIncludedPhraseIds(child, definitions, state),
        ),
    ];
};

export const summarizeGroup = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
): ResolvedPhrase[] => {
    const ids = new Set(collectIncludedPhraseIds(groupId, definitions, state));
    return [...ids]
        .map((id) => resolved.phrases[id])
        .filter((phrase) => phrase.included && phrase.kind === "abnormal");
};

const collectSummaryGroupIds = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
): string[] => {
    if (!isGroupEnabled(groupId, definitions, state)) return [];
    const group = definitions.groups[groupId];
    return [
        ...(group.summary === true ? [groupId] : []),
        ...(group.children ?? []).flatMap((child) =>
            collectSummaryGroupIds(child, definitions, state),
        ),
    ];
};

export const renderGroupText = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
): string => {
    if (!isGroupEnabled(groupId, definitions, state)) {
        return "";
    }
    const group = definitions.groups[groupId];
    const title = parseValue(group.title).text;
    const phrases = (group.phrases ?? [])
        .map((id) => resolved.phrases[id])
        .filter((phrase) => phrase.included)
        .map((phrase) => phrase.text);
    const children = (group.children ?? [])
        .map((id) => renderGroupText(id, definitions, state, resolved))
        .filter(Boolean);

    if (phrases.length > 0) {
        return `${title}: ${phrases.join("; ")};`;
    }
    if (children.length > 0) {
        return `${title}\n${children.join("\n")}`;
    }
    if ((group.phrases ?? []).length > 0) {
        return group.content ?? "";
    }
    return group.content === undefined ? title : `${title}\n${group.content}`;
};

const exportAttributes = (
    values: Record<string, AttributeValue>,
): StructuredItem["attributes"] =>
    Object.fromEntries(
        Object.entries(values).map(([id, value]) => [
            id,
            isDurationValue(value)
                ? { ...value, resolvedStart: resolvedStart(value) }
                : value,
        ]),
    );

export const structuredDocument = (
    root: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
): StructuredDocument => {
    const phraseIds = new Set(collectIncludedPhraseIds(root, definitions, state));
    const all = [...phraseIds].map((id) => resolved.phrases[id]);
    const item = (phrase: ResolvedPhrase): StructuredItem => ({
        id: phrase.id,
        valueId: phrase.valueId,
        text: phrase.text,
        kind: phrase.kind,
        source: phrase.source,
        provenance: [...phrase.provenance],
        attributes: exportAttributes(phrase.attributes),
        ...(phrase.coding === undefined ? {} : { coding: phrase.coding }),
    });

    return {
        version: 1,
        root,
        text: renderGroupText(root, definitions, state, resolved),
        items: all.filter((phrase) => phrase.included).map(item),
        suggestions: all
            .filter((phrase) => phrase.visible && !phrase.included)
            .map((phrase) => ({
                id: phrase.id,
                valueId: phrase.valueId,
                text: phrase.text,
                kind: phrase.kind,
            })),
        summaries: collectSummaryGroupIds(root, definitions, state).map(
            (groupId) => ({
                groupId,
                title: parseValue(definitions.groups[groupId].title).text,
                items: summarizeGroup(groupId, definitions, state, resolved).map(
                    (phrase) => ({
                        id: phrase.id,
                        valueId: phrase.valueId,
                        text: phrase.text,
                        kind: phrase.kind,
                    }),
                ),
            }),
        ),
    };
};
