import {
    attributePlaceholders,
    formatAttribute,
    groupHeading,
    hasAttributeValue,
    isDurationValue,
    parseValue,
    resolvedStart,
} from "./textblocklib.js";
import type {
    AttributeValue,
    ConditionDefinition,
    Definitions,
    DocumentState,
    EditorDefinition,
    GroupDefinition,
    PackageDefinition,
    ResolvedDocument,
    ResolvedPart,
    ResolvedPhrase,
    ScopeState,
    StructuredDocument,
    StructuredItem,
    StructuredSummaryItem,
} from "./textblocktypes.js";

export const createScopeState = (): ScopeState => ({
    activeSets: [],
    completedPrompts: [],
    phraseOverrides: {},
    groupOverrides: {},
    attributes: {},
    acceptedProvenance: {},
});

export const createDocumentState = (): DocumentState => ({
    ...createScopeState(),
    groupInstances: {},
    instanceStates: {},
});

export const scopeState = (
    state: DocumentState,
    instanceId?: string,
): ScopeState => {
    if (instanceId === undefined) return state;
    const scope = state.instanceStates[instanceId];
    if (scope === undefined) {
        throw new Error(`Unknown group instance "${instanceId}"`);
    }
    return scope;
};

export const phraseKey = (phraseId: string, instanceId?: string): string =>
    instanceId === undefined ? phraseId : `${instanceId}:${phraseId}`;

export const groupItems = (group: GroupDefinition) =>
    group.items ?? [
        ...(group.phrases ?? []).map((id) => ({ type: "phrase" as const, id })),
        ...(group.children ?? []).map((id) => ({ type: "group" as const, id })),
    ];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export const isPackage = (value: unknown): value is PackageDefinition => {
    if (!isRecord(value) || value.version !== 2) return false;
    return (
        isRecord(value.groups) &&
        isRecord(value.phrases) &&
        (value.catalogs === undefined || isRecord(value.catalogs)) &&
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
        if (id in target) throw new Error(`Duplicate ${kind} id "${id}"`);
        target[id] = definition;
    }
};

export const mergePackage = (
    definitions: Definitions,
    packageDefinition: PackageDefinition,
): void => {
    mergeRecord(definitions.groups, packageDefinition.groups, "group");
    mergeRecord(definitions.sets, packageDefinition.sets ?? {}, "set");
    mergeRecord(definitions.editors, packageDefinition.editors ?? {}, "editor");
    mergeRecord(definitions.catalogs, packageDefinition.catalogs ?? {}, "catalog");
    for (const [id, phrase] of Object.entries(packageDefinition.phrases)) {
        if (id in definitions.phrases) throw new Error(`Duplicate phrase id "${id}"`);
        if (phrase.catalog === undefined) {
            definitions.phrases[id] = phrase;
            continue;
        }
        const catalog = definitions.catalogs[phrase.catalog];
        if (catalog === undefined) {
            throw new Error(`Unknown value catalog "${phrase.catalog}"`);
        }
        definitions.phrases[id] = {
            ...phrase,
            values: { ...catalog.values, ...phrase.values },
            attributes: {
                ...(catalog.attributes ?? {}),
                ...(phrase.attributes ?? {}),
            },
        };
    }
};

export const validateDefinitions = (definitions: Definitions): void => {
    const valueOwners = new Map<string, string>();
    const itemKinds = new Set(["normal", "abnormal", "intervention", "neutral"]);

    for (const [catalogId, catalog] of Object.entries(definitions.catalogs)) {
        const lensIds = new Set(catalog.lenses.map((lens) => lens.id));
        if (
            catalog.lenses.some(
                (lens) => lens.id === "" || lens.label === "",
            ) ||
            lensIds.size !== catalog.lenses.length
        ) {
            throw new Error(`Invalid lenses in catalog "${catalogId}"`);
        }
        for (const [valueId, value] of Object.entries(catalog.values)) {
            if (
                !Array.isArray(value.lenses) ||
                value.lenses.some((lens) => !lensIds.has(lens)) ||
                !Array.isArray(value.tags) ||
                value.tags.some(
                    (tag) =>
                        typeof tag !== "string" ||
                        !/^[a-z][a-z0-9_]*$/.test(tag),
                )
            ) {
                throw new Error(`Invalid metadata in catalog value "${valueId}"`);
            }
        }
    }

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
        if (phrase.prompt !== undefined && typeof phrase.prompt !== "boolean") {
            throw new Error(`Invalid prompt state in phrase "${id}"`);
        }
        if (phrase.prompt === true && Object.keys(phrase.values).length < 2) {
            throw new Error(`Prompt phrase "${id}" needs at least two values`);
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
            if (value.points !== undefined && !Number.isFinite(value.points)) {
                throw new Error(`Invalid score points in value "${valueId}"`);
            }
            for (const placeholder of attributePlaceholders(value.text)) {
                if (phrase.attributes?.[placeholder.id] === undefined) {
                    throw new Error(
                        `Missing attribute "${placeholder.id}" in value "${valueId}"`,
                    );
                }
            }
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

    const validateCondition = (condition: unknown, owner: string): void => {
        if (
            !isRecord(condition) ||
            !Array.isArray(condition.values) ||
            condition.values.length === 0 ||
            condition.values.some(
                (valueId) =>
                    typeof valueId !== "string" || !valueOwners.has(valueId),
            ) ||
            typeof condition.negated !== "boolean"
        ) {
            throw new Error(`Invalid condition in "${owner}"`);
        }
    };

    for (const [id, group] of Object.entries(definitions.groups)) {
        if (group.kind !== undefined && !itemKinds.has(group.kind)) {
            throw new Error(`Invalid kind in group "${id}"`);
        }
        if (
            group.subgroups !== undefined &&
            group.subgroups !== "flow" &&
            group.subgroups !== "break"
        ) {
            throw new Error(`Invalid subgroup layout in group "${id}"`);
        }
        if (
            group.autoCompact !== undefined &&
            typeof group.autoCompact !== "boolean"
        ) {
            throw new Error(`Invalid auto-compact state in group "${id}"`);
        }
        if (group.score !== undefined) {
            const score = group.score;
            const targetPhrase = definitions.phrases[score.target.phraseId];
            const targetEditorId =
                targetPhrase?.attributes?.[score.target.attributeId];
            if (
                typeof score.id !== "string" ||
                score.id === "" ||
                typeof score.label !== "string" ||
                score.label === "" ||
                !Number.isFinite(score.minimum) ||
                !Number.isFinite(score.maximum) ||
                score.minimum > score.maximum ||
                !Array.isArray(score.criteria) ||
                score.criteria.length === 0 ||
                targetPhrase === undefined ||
                !(score.target.valueId in targetPhrase.values) ||
                definitions.editors[targetEditorId ?? ""]?.type !== "number"
            ) {
                throw new Error(`Invalid score configuration in group "${id}"`);
            }
            for (const criterion of score.criteria) {
                const phrase = definitions.phrases[criterion.phraseId];
                if (
                    phrase === undefined ||
                    typeof criterion.title !== "string" ||
                    !Array.isArray(criterion.options) ||
                    criterion.options.length === 0 ||
                    criterion.options.some(
                        (option) =>
                            !(option.valueId in phrase.values) ||
                            !Number.isFinite(option.points),
                    )
                ) {
                    throw new Error(`Invalid score criterion in group "${id}"`);
                }
            }
        }
        if (group.repeatable !== undefined) {
            if (group.condition !== undefined) {
                throw new Error(`Repeatable group "${id}" cannot be conditional`);
            }
            if (
                !Number.isInteger(group.repeatable.initial ?? 0) ||
                (group.repeatable.initial ?? 0) < 0 ||
                group.repeatable.add === ""
            ) {
                throw new Error(`Invalid repeatable configuration in group "${id}"`);
            }
            if (
                group.repeatable.empty !== undefined &&
                !(group.repeatable.empty in definitions.phrases)
            ) {
                throw new Error(
                    `Unknown empty phrase "${group.repeatable.empty}" in group "${id}"`,
                );
            }
        }
        if (group.condition !== undefined) {
            validateCondition(group.condition, id);
        }
        if (group.reveal !== undefined && group.reveal !== "initial") {
            validateCondition(group.reveal, `${id} reveal`);
        }
        for (const child of group.children ?? []) {
            if (!(child in definitions.groups)) {
                throw new Error(`Unknown child group "${child}" in group "${id}"`);
            }
            if (
                group.repeatable !== undefined &&
                definitions.groups[child].repeatable !== undefined
            ) {
                throw new Error(`Nested repeatable group "${child}" is not supported`);
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
        if (group.items !== undefined) {
            for (const item of group.items) {
                if (
                    !isRecord(item) ||
                    (item.type !== "phrase" && item.type !== "group") ||
                    typeof item.id !== "string" ||
                    !(item.id in
                        (item.type === "phrase"
                            ? definitions.phrases
                            : definitions.groups))
                ) {
                    throw new Error(`Invalid ordered item in group "${id}"`);
                }
            }
            const orderedPhrases = group.items
                .filter((item) => item.type === "phrase")
                .map((item) => item.id)
                .sort();
            const orderedChildren = group.items
                .filter((item) => item.type === "group")
                .map((item) => item.id)
                .sort();
            if (
                orderedPhrases.join("\0") !==
                    [...(group.phrases ?? [])].sort().join("\0") ||
                orderedChildren.join("\0") !==
                    [...(group.children ?? [])].sort().join("\0")
            ) {
                throw new Error(`Ordered items do not match group "${id}"`);
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
        for (const [trigger, valueId] of Object.entries(phrase.suggestions ?? {})) {
            if (!valueOwners.has(trigger)) {
                throw new Error(`Unknown suggestion trigger "${trigger}" in "${id}"`);
            }
            if (valueId !== null && !(valueId in phrase.values)) {
                throw new Error(`Unknown suggested value "${valueId}" in "${id}"`);
            }
        }
        if (phrase.condition !== undefined) {
            validateCondition(phrase.condition, id);
            if (
                phrase.condition.suggestion !== null &&
                !(phrase.condition.suggestion in phrase.values)
            ) {
                throw new Error(
                    `Unknown condition suggestion "${phrase.condition.suggestion}" in "${id}"`,
                );
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
    let cursor = 0;

    for (const placeholder of attributePlaceholders(text)) {
        if (placeholder.start > cursor) {
            parts.push({
                type: "text",
                text: text.slice(cursor, placeholder.start),
            });
        }
        const attributeId = placeholder.id;
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
            required: placeholder.required,
            ...(value === undefined ? {} : { value }),
        });
        cursor = placeholder.end;
    }

    if (cursor < text.length) parts.push({ type: "text", text: text.slice(cursor) });
    return parts.length === 0 ? [{ type: "text", text }] : parts;
};

const refreshPhraseText = (
    phrase: ResolvedPhrase,
    definitions: Definitions,
    scope: ScopeState,
): void => {
    const definition = definitions.phrases[phrase.id];
    const selected =
        phrase.valueId === null ? undefined : definition.values[phrase.valueId];
    const parsed =
        selected === undefined ? { text: definition.title } : parseValue(selected);
    const storedAttributes = scope.attributes[phrase.id] ?? {};
    phrase.parts = attributeParts(
        parsed.text,
        phrase.id,
        definition.attributes ?? {},
        storedAttributes,
        definitions.editors,
    );
    phrase.attributes = Object.fromEntries(
        phrase.parts.flatMap((part): Array<[string, AttributeValue]> =>
            part.type === "attribute" && part.value !== undefined
                ? [[part.id, part.value]]
                : [],
        ),
    );
    phrase.text = phrase.parts
        .map((part) =>
            part.type === "text" || hasAttributeValue(part.value) ? part.text : "",
        )
        .join("")
        .replace(/\s+/g, " ")
        .replace(/\s+([,.;:])/g, "$1")
        .trim();
    phrase.coding = parsed.coding;
    phrase.kind = parsed.kind ?? definition.kind ?? "neutral";
    if (
        phrase.included &&
        phrase.parts.some(
            (part) =>
                part.type === "attribute" &&
                part.required &&
                !hasAttributeValue(part.value),
        )
    ) {
        phrase.included = false;
    }
};

const phraseIdsInGroup = (
    groupId: string,
    definitions: Definitions,
    includeRepeatableChildren = false,
): string[] => {
    const group = definitions.groups[groupId];
    return groupItems(group).flatMap((item) => {
        if (item.type === "phrase") return [item.id];
        const child = item.id;
        if (
            definitions.groups[child].repeatable !== undefined &&
            !includeRepeatableChildren
        ) {
            return [];
        }
        return phraseIdsInGroup(child, definitions, includeRepeatableChildren);
    });
};

const repeatedPhraseIds = (definitions: Definitions): Set<string> =>
    new Set(
        Object.entries(definitions.groups).flatMap(([groupId, group]) =>
            group.repeatable === undefined
                ? []
                : phraseIdsInGroup(groupId, definitions),
        ),
    );

const groupIdsInGroup = (
    groupId: string,
    definitions: Definitions,
): string[] => [
    groupId,
    ...groupItems(definitions.groups[groupId]).flatMap((item) =>
        item.type === "group" ? groupIdsInGroup(item.id, definitions) : [],
    ),
];

const inactivePhraseIds = (
    definitions: Definitions,
    scope: ScopeState,
    groupIds: ReadonlySet<string>,
): Set<string> =>
    new Set(
        [...groupIds].flatMap((groupId) => {
            const group = definitions.groups[groupId];
            const enabled = scope.groupOverrides[groupId] ?? group.default ?? true;
            return enabled ? [] : phraseIdsInGroup(groupId, definitions, true);
        }),
    );

const refreshEffectiveInclusion = (
    phrases: Record<string, ResolvedPhrase>,
    inactive: ReadonlySet<string>,
): void => {
    for (const phrase of Object.values(phrases)) {
        phrase.effectiveIncluded = phrase.included && !inactive.has(phrase.id);
    }
};

const resolveScope = (
    phraseIds: readonly string[],
    definitions: Definitions,
    scope: ScopeState,
    instanceId?: string,
    additionalActiveValues: ReadonlySet<string> = new Set(),
    inactive: ReadonlySet<string> = new Set(),
): Record<string, ResolvedPhrase> => {
    const phrases: Record<string, ResolvedPhrase> = {};

    for (const id of phraseIds) {
        const definition = definitions.phrases[id];
        const defaultId = definition.default;
        const key = phraseKey(id, instanceId);
        phrases[key] = {
            key,
            id,
            ...(instanceId === undefined ? {} : { instanceId }),
            title: definition.title,
            valueId: defaultId === "" || defaultId === null ? null : defaultId,
            text: definition.title,
            parts: [],
            visible: defaultId !== null,
            included: defaultId !== "" && defaultId !== null,
            effectiveIncluded: false,
            source: "default",
            provenance: [],
            touched: false,
            attributes: {},
            kind: definition.kind ?? "neutral",
        };
    }

    for (const setId of scope.activeSets) {
        const set = definitions.sets[setId];
        if (set === undefined) continue;
        for (const [phraseId, valueId] of Object.entries(set.values)) {
            if (scope.phraseOverrides[phraseId] !== undefined) continue;
            const phrase = phrases[phraseKey(phraseId, instanceId)];
            if (phrase === undefined) continue;
            phrase.valueId = valueId;
            phrase.visible = true;
            phrase.included = valueId !== null;
            phrase.source = "set";
            phrase.provenance = [setId];
        }
    }

    for (const [phraseId, override] of Object.entries(scope.phraseOverrides)) {
        const phrase = phrases[phraseKey(phraseId, instanceId)];
        if (phrase === undefined) continue;
        phrase.valueId = override.valueId;
        phrase.visible = true;
        phrase.included = override.included && override.valueId !== null;
        phrase.source = "user";
        phrase.provenance = scope.acceptedProvenance[phraseId] ?? [phraseId];
        phrase.touched = true;
    }

    // Attribute completeness affects inclusion and therefore suggestion triggers.
    for (const phrase of Object.values(phrases)) {
        refreshPhraseText(phrase, definitions, scope);
    }
    refreshEffectiveInclusion(phrases, inactive);

    const activeValues = new Set([
        ...additionalActiveValues,
        ...Object.values(phrases)
            .filter(
                (phrase) =>
                    phrase.effectiveIncluded && phrase.valueId !== null,
            )
            .map((phrase) => phrase.valueId as string),
    ]);

    for (const phraseId of phraseIds) {
        const definition = definitions.phrases[phraseId];
        const phrase = phrases[phraseKey(phraseId, instanceId)];
        if (
            scope.phraseOverrides[phraseId] !== undefined ||
            phrase.source === "set"
        ) {
            continue;
        }
        const matches = Object.entries(definition.suggestions ?? {}).filter(
            ([trigger]) => activeValues.has(trigger),
        );
        if (matches.length === 0) continue;
        const [, valueId] = matches[matches.length - 1];
        phrase.valueId = valueId;
        phrase.visible = true;
        phrase.included = false;
        phrase.source = "suggestion";
        phrase.provenance = matches.map(([source]) => source);
    }

    for (const phraseId of phraseIds) {
        const definition = definitions.phrases[phraseId];
        const condition = definition.condition;
        const phrase = phrases[phraseKey(phraseId, instanceId)];
        if (
            condition === undefined ||
            scope.phraseOverrides[phraseId] !== undefined ||
            phrase.source === "set"
        ) {
            continue;
        }
        const hasMatch = condition.values.some((valueId) =>
            activeValues.has(valueId),
        );
        const conditionMet = condition.negated ? !hasMatch : hasMatch;
        if (!conditionMet) continue;
        phrase.valueId = condition.suggestion;
        phrase.visible = true;
        phrase.included = false;
        phrase.source = "suggestion";
        phrase.provenance = [...condition.values];
    }

    for (const phrase of Object.values(phrases)) {
        refreshPhraseText(phrase, definitions, scope);
    }
    refreshEffectiveInclusion(phrases, inactive);
    return phrases;
};

export const resolveDocument = (
    definitions: Definitions,
    state: DocumentState,
): ResolvedDocument => {
    const repeated = repeatedPhraseIds(definitions);
    const repeatedGroups = new Set(
        Object.entries(definitions.groups).flatMap(([groupId, group]) =>
            group.repeatable === undefined
                ? []
                : groupIdsInGroup(groupId, definitions),
        ),
    );
    const globalGroups = new Set(
        Object.keys(definitions.groups).filter(
            (groupId) => !repeatedGroups.has(groupId),
        ),
    );
    const globalInactive = inactivePhraseIds(
        definitions,
        state,
        globalGroups,
    );
    const globalIds = Object.keys(definitions.phrases).filter(
        (phraseId) => !repeated.has(phraseId),
    );
    const phrases: Record<string, ResolvedPhrase> = {};
    const repeatedActiveValues = new Set<string>();

    for (const [groupId, instanceIds] of Object.entries(state.groupInstances)) {
        const group = definitions.groups[groupId];
        if (group?.repeatable === undefined) continue;
        const phraseIds = phraseIdsInGroup(groupId, definitions);
        for (const instanceId of instanceIds) {
            const scope = state.instanceStates[instanceId];
            if (scope === undefined) continue;
            const instancePhrases = resolveScope(
                phraseIds,
                definitions,
                scope,
                instanceId,
                new Set(),
                new Set([
                    ...globalInactive,
                    ...inactivePhraseIds(
                        definitions,
                        scope,
                        new Set(groupIdsInGroup(groupId, definitions)),
                    ),
                ]),
            );
            Object.assign(phrases, instancePhrases);
            for (const phrase of Object.values(instancePhrases)) {
                if (phrase.effectiveIncluded && phrase.valueId !== null) {
                    repeatedActiveValues.add(phrase.valueId);
                }
            }
        }
    }

    Object.assign(
        phrases,
        resolveScope(
            globalIds,
            definitions,
            state,
            undefined,
            repeatedActiveValues,
            globalInactive,
        ),
    );

    for (const [groupId, instanceIds] of Object.entries(state.groupInstances)) {
        const group = definitions.groups[groupId];
        if (
            group?.repeatable === undefined ||
            instanceIds.length === 0 ||
            group.repeatable.empty === undefined
        ) {
            continue;
        }
        const empty = phrases[phraseKey(group.repeatable.empty)];
        if (empty !== undefined) {
            empty.visible = false;
            empty.included = false;
            empty.effectiveIncluded = false;
        }
    }

    return { phrases };
};

export const isGroupEnabled = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
    instanceId?: string,
): boolean => {
    const scope = scopeState(state, instanceId);
    return (
        scope.groupOverrides[groupId] ?? definitions.groups[groupId]?.default ?? true
    );
};

export const isGroupConditionMet = (
    groupId: string,
    definitions: Definitions,
    resolved: ResolvedDocument,
    instanceId?: string,
): boolean => {
    const condition = definitions.groups[groupId]?.condition;
    if (condition === undefined) return true;
    return isConditionMet(condition, resolved, instanceId);
};

export const isConditionMet = (
    condition: ConditionDefinition,
    resolved: ResolvedDocument,
    instanceId?: string,
): boolean => {
    const hasMatch = Object.values(resolved.phrases).some(
        (phrase) =>
            (instanceId === undefined || phrase.instanceId === instanceId) &&
            phrase.effectiveIncluded &&
            phrase.valueId !== null &&
            condition.values.includes(phrase.valueId),
    );
    return condition.negated ? !hasMatch : hasMatch;
};

const collectGroupPhrases = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    instanceId?: string,
): ResolvedPhrase[] => {
    if (!isGroupEnabled(groupId, definitions, state, instanceId)) return [];
    if (!isGroupConditionMet(groupId, definitions, resolved, instanceId)) return [];
    const group = definitions.groups[groupId];
    return groupItems(group).flatMap((item): ResolvedPhrase[] => {
        if (item.type === "phrase") {
            const phrase = resolved.phrases[phraseKey(item.id, instanceId)];
            return phrase === undefined ? [] : [phrase];
        }
        const child = item.id;
        const childGroup = definitions.groups[child];
        if (childGroup.repeatable !== undefined && instanceId === undefined) {
            return (state.groupInstances[child] ?? []).flatMap((childInstance) =>
                collectGroupPhrases(
                    child,
                    definitions,
                    state,
                    resolved,
                    childInstance,
                ),
            );
        }
        return collectGroupPhrases(
            child,
            definitions,
            state,
            resolved,
            instanceId,
        );
    });
};

const collectDisplayGroupPhrases = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    instanceId?: string,
): ResolvedPhrase[] => {
    if (!isGroupConditionMet(groupId, definitions, resolved, instanceId)) return [];
    const group = definitions.groups[groupId];
    return groupItems(group).flatMap((item): ResolvedPhrase[] => {
        if (item.type === "phrase") {
            const phrase = resolved.phrases[phraseKey(item.id, instanceId)];
            return phrase === undefined ? [] : [phrase];
        }
        const child = item.id;
        const childGroup = definitions.groups[child];
        if (childGroup.repeatable !== undefined && instanceId === undefined) {
            return (state.groupInstances[child] ?? []).flatMap((childInstance) =>
                collectDisplayGroupPhrases(
                    child,
                    definitions,
                    state,
                    resolved,
                    childInstance,
                ),
            );
        }
        return collectDisplayGroupPhrases(
            child,
            definitions,
            state,
            resolved,
            instanceId,
        );
    });
};

const hasConditionallyVisibleGroup = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    instanceId?: string,
): boolean => {
    if (!isGroupConditionMet(groupId, definitions, resolved, instanceId)) {
        return false;
    }
    const group = definitions.groups[groupId];
    if (group.condition !== undefined) return true;
    return groupItems(group).some((item) => {
        if (item.type === "phrase") return false;
        const child = definitions.groups[item.id];
        if (child.repeatable !== undefined && instanceId === undefined) {
            return (state.groupInstances[item.id] ?? []).some((childInstance) =>
                hasConditionallyVisibleGroup(
                    item.id,
                    definitions,
                    state,
                    resolved,
                    childInstance,
                ),
            );
        }
        return hasConditionallyVisibleGroup(
            item.id,
            definitions,
            state,
            resolved,
            instanceId,
        );
    });
};

export const groupPhrasePresence = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    instanceId?: string,
): { included: boolean; suggested: boolean } => {
    const phrases = collectDisplayGroupPhrases(
        groupId,
        definitions,
        state,
        resolved,
        instanceId,
    );
    return {
        included: phrases.some((phrase) => phrase.effectiveIncluded),
        suggested:
            phrases.some(
                (phrase) => phrase.visible && phrase.source === "suggestion",
            ) ||
            hasConditionallyVisibleGroup(
                groupId,
                definitions,
                state,
                resolved,
                instanceId,
            ),
    };
};

export const summarizeGroup = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
): ResolvedPhrase[] => {
    const unique = new Map(
        collectGroupPhrases(groupId, definitions, state, resolved).map((phrase) => [
            phrase.key,
            phrase,
        ]),
    );
    return [...unique.values()].filter(
        (phrase) => phrase.effectiveIncluded && phrase.kind === "abnormal",
    );
};

const collectSummaryGroupIds = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    instanceId?: string,
): string[] => {
    if (!isGroupEnabled(groupId, definitions, state, instanceId)) return [];
    if (!isGroupConditionMet(groupId, definitions, resolved, instanceId)) return [];
    const group = definitions.groups[groupId];
    return [
        ...(group.summary === true ? [groupId] : []),
        ...groupItems(group).flatMap((item) =>
            item.type === "group" &&
            definitions.groups[item.id].repeatable === undefined
                ? collectSummaryGroupIds(
                      item.id,
                      definitions,
                      state,
                      resolved,
                      instanceId,
                  )
                : [],
        ),
    ];
};

const renderGroupTextInternal = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    instanceId?: string,
    instanceIndex?: number,
): string => {
    if (!isGroupEnabled(groupId, definitions, state, instanceId)) return "";
    if (!isGroupConditionMet(groupId, definitions, resolved, instanceId)) return "";
    const group = definitions.groups[groupId];
    const baseTitle = parseValue(group.title).text;
    const title =
        instanceIndex === undefined ? baseTitle : `${baseTitle} ${instanceIndex + 1}`;
    const heading = groupHeading(title);
    const phrases = (group.phrases ?? [])
        .map((id) => resolved.phrases[phraseKey(id, instanceId)])
        .filter(
            (phrase): phrase is ResolvedPhrase =>
                phrase?.effectiveIncluded === true,
        )
        .map((phrase) => phrase.text);
    const children = (group.children ?? [])
        .flatMap((child) => {
            const childGroup = definitions.groups[child];
            if (childGroup.repeatable !== undefined && instanceId === undefined) {
                return (state.groupInstances[child] ?? []).map(
                    (childInstance, index) =>
                        renderGroupTextInternal(
                            child,
                            definitions,
                            state,
                            resolved,
                            childInstance,
                            index,
                        ),
                );
            }
            return [
                renderGroupTextInternal(
                    child,
                    definitions,
                    state,
                    resolved,
                    instanceId,
                ),
            ];
        })
        .filter(Boolean);

    const own = phrases.length > 0 ? `${heading} ${phrases.join("; ")};` : "";
    if (own !== "" && children.length > 0) return `${own}\n${children.join("\n")}`;
    if (own !== "") return own;
    if (children.length > 0) return `${heading}\n${children.join("\n")}`;
    if ((group.phrases ?? []).length > 0) return group.content ?? "";
    return group.content === undefined ? heading : `${heading}\n${group.content}`;
};

export const renderGroupText = (
    groupId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
): string => renderGroupTextInternal(groupId, definitions, state, resolved);

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

const summaryItem = (phrase: ResolvedPhrase): StructuredSummaryItem => ({
    id: phrase.id,
    ...(phrase.instanceId === undefined ? {} : { instanceId: phrase.instanceId }),
    valueId: phrase.valueId,
    text: phrase.text,
    kind: phrase.kind,
    source: phrase.source,
    provenance: [...phrase.provenance],
    attributes: exportAttributes(phrase.attributes),
});

export const structuredDocument = (
    root: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
): StructuredDocument => {
    const all = [
        ...new Map(
            collectDisplayGroupPhrases(root, definitions, state, resolved).map(
                (phrase) => [phrase.key, phrase],
            ),
        ).values(),
    ];
    const item = (phrase: ResolvedPhrase): StructuredItem => ({
        id: phrase.id,
        ...(phrase.instanceId === undefined
            ? {}
            : { instanceId: phrase.instanceId }),
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
        items: all.filter((phrase) => phrase.effectiveIncluded).map(item),
        suggestions: all
            .filter(
                (phrase) =>
                    phrase.visible && phrase.source === "suggestion",
            )
            .map(summaryItem),
        summaries: collectSummaryGroupIds(root, definitions, state, resolved).map(
            (groupId) => ({
                groupId,
                title: parseValue(definitions.groups[groupId].title).text,
                items: summarizeGroup(groupId, definitions, state, resolved).map(
                    summaryItem,
                ),
            }),
        ),
    };
};
