import { attributePlaceholders, formatAttribute, groupHeading, hasAttributeValue, isDurationValue, parseValue, resolvedStart, } from "./textblocklib.js";
import { isRecord } from "../../lib/guards.js";
export const createScopeState = () => ({
    activeSets: [],
    completedPrompts: [],
    phraseOverrides: {},
    groupOverrides: {},
    attributes: {},
    acceptedProvenance: {},
});
export const createDocumentState = () => ({
    ...createScopeState(),
    groupInstances: {},
    instanceStates: {},
});
export const scopeState = (state, instanceId) => {
    if (instanceId === undefined)
        return state;
    const scope = state.instanceStates[instanceId];
    if (scope === undefined) {
        throw new Error(`Unknown group instance "${instanceId}"`);
    }
    return scope;
};
export const phraseKey = (phraseId, instanceId) => instanceId === undefined ? phraseId : `${instanceId}:${phraseId}`;
export const groupCompactDefault = (enabled, insideAutoCompact, autoCompact) => !enabled || insideAutoCompact || autoCompact;
export const groupItems = (group) => group.items;
const attentionRank = {
    none: 0,
    conditional: 1,
    suggested: 2,
    required: 3,
};
const strongestAttention = (left, right) => attentionRank[right] > attentionRank[left] ? right : left;
export const isPackage = (value) => {
    if (!isRecord(value) || value.version !== 2)
        return false;
    return (isRecord(value.groups) &&
        isRecord(value.phrases) &&
        (value.catalogs === undefined || isRecord(value.catalogs)) &&
        (value.imports === undefined ||
            (Array.isArray(value.imports) &&
                value.imports.every((id) => typeof id === "string" && id !== ""))));
};
const mergeRecord = (target, source, kind) => {
    for (const [id, definition] of Object.entries(source)) {
        if (id in target)
            throw new Error(`Duplicate ${kind} id "${id}"`);
        target[id] = definition;
    }
};
export const mergePackage = (definitions, packageDefinition) => {
    mergeRecord(definitions.groups, packageDefinition.groups, "group");
    mergeRecord(definitions.sets, packageDefinition.sets ?? {}, "set");
    mergeRecord(definitions.editors, packageDefinition.editors ?? {}, "editor");
    mergeRecord(definitions.catalogs, packageDefinition.catalogs ?? {}, "catalog");
    for (const [id, phrase] of Object.entries(packageDefinition.phrases)) {
        if (id in definitions.phrases)
            throw new Error(`Duplicate phrase id "${id}"`);
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
const attributeParts = (text, phraseId, attributes, values, editors) => {
    const parts = [];
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
            throw new Error(`Missing editor for attribute "${phraseId}.${attributeId}"`);
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
    if (cursor < text.length)
        parts.push({ type: "text", text: text.slice(cursor) });
    return parts.length === 0 ? [{ type: "text", text }] : parts;
};
const refreshPhraseText = (phrase, definitions, scope) => {
    const definition = definitions.phrases[phrase.id];
    const selected = phrase.valueId === null ? undefined : definition.values[phrase.valueId];
    const parsed = selected === undefined ? { text: definition.title } : parseValue(selected);
    const storedAttributes = scope.attributes[phrase.id] ?? {};
    phrase.parts = attributeParts(parsed.text, phrase.id, definition.attributes ?? {}, storedAttributes, definitions.editors);
    phrase.attributes = Object.fromEntries(phrase.parts.flatMap((part) => part.type === "attribute" && part.value !== undefined
        ? [[part.id, part.value]]
        : []));
    phrase.text = phrase.parts
        .map((part) => part.type === "text" || hasAttributeValue(part.value) ? part.text : "")
        .join("")
        .replace(/\s+/g, " ")
        .replace(/\s+([,.;:])/g, "$1")
        .trim();
    phrase.coding = parsed.coding;
    phrase.kind = parsed.kind ?? definition.kind ?? "neutral";
    if (phrase.included &&
        phrase.parts.some((part) => part.type === "attribute" &&
            part.required &&
            !hasAttributeValue(part.value))) {
        phrase.included = false;
    }
};
const phraseIdsInGroup = (groupId, definitions, includeRepeatableChildren = false) => {
    const group = definitions.groups[groupId];
    return groupItems(group).flatMap((item) => {
        if (item.type === "phrase")
            return [item.id];
        const child = item.id;
        if (definitions.groups[child].repeatable !== undefined &&
            !includeRepeatableChildren) {
            return [];
        }
        return phraseIdsInGroup(child, definitions, includeRepeatableChildren);
    });
};
const repeatedPhraseIds = (definitions) => new Set(Object.entries(definitions.groups).flatMap(([groupId, group]) => group.repeatable === undefined
    ? []
    : phraseIdsInGroup(groupId, definitions)));
const groupIdsInGroup = (groupId, definitions) => [
    groupId,
    ...groupItems(definitions.groups[groupId]).flatMap((item) => item.type === "group" ? groupIdsInGroup(item.id, definitions) : []),
];
const groupDefaultEnabled = (group, activeLens) => group.activeLenses === undefined
    ? (group.default ?? true)
    : group.activeLenses.includes(activeLens);
const groupApplicable = (group, activeLens) => group.lenses === undefined || group.lenses.includes(activeLens);
const scopeGroupEnabled = (groupId, definitions, scope, activeLens) => scope.groupOverrides[groupId] ??
    groupDefaultEnabled(definitions.groups[groupId], activeLens);
const inactivePhraseIds = (definitions, scope, groupIds, activeLens) => new Set([...groupIds].flatMap((groupId) => {
    const applicable = groupApplicable(definitions.groups[groupId], activeLens);
    const enabled = applicable && scopeGroupEnabled(groupId, definitions, scope, activeLens);
    return enabled ? [] : phraseIdsInGroup(groupId, definitions, true);
}));
const refreshEffectiveInclusion = (phrases, inactive) => {
    for (const phrase of Object.values(phrases)) {
        const active = !inactive.has(phrase.id);
        phrase.effectiveIncluded = phrase.included && active;
        if (!active)
            phrase.visible = false;
    }
};
const resolveScope = (phraseIds, definitions, scope, instanceId, additionalActiveValues = new Set(), inactive = new Set()) => {
    const phrases = {};
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
            attention: "none",
            provenance: [],
            touched: false,
            attributes: {},
            kind: definition.kind ?? "neutral",
        };
    }
    for (const setId of scope.activeSets) {
        const set = definitions.sets[setId];
        if (set === undefined)
            continue;
        for (const [phraseId, valueId] of Object.entries(set.values)) {
            if (scope.phraseOverrides[phraseId] !== undefined)
                continue;
            const phrase = phrases[phraseKey(phraseId, instanceId)];
            if (phrase === undefined)
                continue;
            phrase.valueId = valueId;
            phrase.visible = true;
            phrase.included = valueId !== null;
            phrase.source = "set";
            phrase.provenance = [setId];
        }
    }
    for (const [phraseId, override] of Object.entries(scope.phraseOverrides)) {
        const phrase = phrases[phraseKey(phraseId, instanceId)];
        if (phrase === undefined)
            continue;
        phrase.valueId = override.valueId;
        phrase.visible = true;
        phrase.included = override.included && override.valueId !== null;
        phrase.source = "user";
        phrase.provenance = scope.acceptedProvenance[phraseId] ?? [phraseId];
        phrase.touched = true;
    }
    for (const phrase of Object.values(phrases)) {
        refreshPhraseText(phrase, definitions, scope);
    }
    refreshEffectiveInclusion(phrases, inactive);
    const activeValues = new Set([
        ...additionalActiveValues,
        ...Object.values(phrases)
            .filter((phrase) => phrase.effectiveIncluded && phrase.valueId !== null)
            .map((phrase) => phrase.valueId),
    ]);
    for (const phraseId of phraseIds) {
        const definition = definitions.phrases[phraseId];
        const condition = definition.condition;
        const phrase = phrases[phraseKey(phraseId, instanceId)];
        if (condition === undefined ||
            scope.phraseOverrides[phraseId] !== undefined ||
            phrase.source === "set") {
            continue;
        }
        const hasMatch = condition.values.some((valueId) => activeValues.has(valueId));
        const conditionMet = condition.negated ? !hasMatch : hasMatch;
        if (!conditionMet)
            continue;
        phrase.valueId = condition.value;
        phrase.visible = true;
        phrase.included = false;
        phrase.source = "conditional";
        phrase.attention = "conditional";
        phrase.provenance = [...condition.values];
    }
    for (const phrase of Object.values(phrases)) {
        refreshPhraseText(phrase, definitions, scope);
    }
    refreshEffectiveInclusion(phrases, inactive);
    for (const phraseId of phraseIds) {
        const definition = definitions.phrases[phraseId];
        const attention = definition.attention;
        const phrase = phrases[phraseKey(phraseId, instanceId)];
        if (attention === undefined || !phrase.visible)
            continue;
        const hasMatch = attention.values.some((valueId) => activeValues.has(valueId));
        const conditionMet = attention.negated ? !hasMatch : hasMatch;
        if (!conditionMet)
            continue;
        const satisfied = phrase.effectiveIncluded &&
            (attention.value === null || phrase.valueId === attention.value);
        if (satisfied)
            continue;
        const override = scope.phraseOverrides[phraseId];
        const explicitlyRejected = override !== undefined &&
            (!override.included ||
                (attention.value !== null && override.valueId !== attention.value));
        if (attention.level === "suggested" && explicitlyRejected)
            continue;
        phrase.attention = attention.level;
    }
    for (const phrase of Object.values(phrases)) {
        if (!phrase.visible)
            phrase.attention = "none";
    }
    return phrases;
};
const conditionMatches = (condition, phrases, instanceId) => {
    const hasMatch = Object.values(phrases).some((phrase) => (instanceId === undefined || phrase.instanceId === instanceId) &&
        phrase.effectiveIncluded &&
        phrase.valueId !== null &&
        condition.values.includes(phrase.valueId));
    return condition.negated ? !hasMatch : hasMatch;
};
export const resolveDocument = (definitions, state, activeLens = "") => {
    const repeated = repeatedPhraseIds(definitions);
    const repeatedGroups = new Set(Object.entries(definitions.groups).flatMap(([groupId, group]) => group.repeatable === undefined
        ? []
        : groupIdsInGroup(groupId, definitions)));
    const globalGroups = new Set(Object.keys(definitions.groups).filter((groupId) => !repeatedGroups.has(groupId)));
    const globalInactive = inactivePhraseIds(definitions, state, globalGroups, activeLens);
    const globalIds = Object.keys(definitions.phrases).filter((phraseId) => !repeated.has(phraseId));
    const phrases = {};
    const repeatedActiveValues = new Set();
    for (const [groupId, instanceIds] of Object.entries(state.groupInstances)) {
        const group = definitions.groups[groupId];
        if (group?.repeatable === undefined)
            continue;
        const phraseIds = phraseIdsInGroup(groupId, definitions);
        for (const instanceId of instanceIds) {
            const scope = state.instanceStates[instanceId];
            if (scope === undefined)
                continue;
            const instancePhrases = resolveScope(phraseIds, definitions, scope, instanceId, new Set(), new Set([
                ...globalInactive,
                ...inactivePhraseIds(definitions, scope, new Set(groupIdsInGroup(groupId, definitions)), activeLens),
            ]));
            Object.assign(phrases, instancePhrases);
            for (const phrase of Object.values(instancePhrases)) {
                if (phrase.effectiveIncluded && phrase.valueId !== null) {
                    repeatedActiveValues.add(phrase.valueId);
                }
            }
        }
    }
    Object.assign(phrases, resolveScope(globalIds, definitions, state, undefined, repeatedActiveValues, globalInactive));
    for (const [groupId, instanceIds] of Object.entries(state.groupInstances)) {
        const group = definitions.groups[groupId];
        if (group?.repeatable === undefined || group.repeatable.empty === undefined) {
            continue;
        }
        const phraseIds = phraseIdsInGroup(groupId, definitions);
        const hasCompletedInstance = instanceIds.some((instanceId) => phraseIds.some((phraseId) => phrases[phraseKey(phraseId, instanceId)]?.effectiveIncluded ===
            true));
        if (!hasCompletedInstance)
            continue;
        const empty = phrases[phraseKey(group.repeatable.empty)];
        if (empty !== undefined) {
            empty.visible = false;
            empty.included = false;
            empty.effectiveIncluded = false;
        }
    }
    const groups = {};
    const resolveGroup = (groupId, instanceId) => {
        const key = phraseKey(groupId, instanceId);
        const cached = groups[key];
        if (cached !== undefined)
            return cached;
        const group = definitions.groups[groupId];
        const applicable = groupApplicable(group, activeLens);
        const enabled = isGroupEnabled(groupId, definitions, state, instanceId, activeLens);
        if (group.repeatable !== undefined && instanceId === undefined) {
            const instances = (state.groupInstances[groupId] ?? []).map((id) => resolveGroup(groupId, id));
            const aggregate = {
                applicable,
                enabled,
                conditionMet: true,
                included: instances.some((entry) => entry.included),
                attention: instances.reduce((level, entry) => strongestAttention(level, entry.attention), "none"),
            };
            groups[key] = aggregate;
            return aggregate;
        }
        const conditionMet = group.condition === undefined ||
            conditionMatches(group.condition, phrases, instanceId);
        if (!conditionMet) {
            const hidden = {
                applicable,
                enabled,
                conditionMet: false,
                included: false,
                attention: "none",
            };
            groups[key] = hidden;
            return hidden;
        }
        if (!enabled) {
            const inactive = {
                applicable,
                enabled: false,
                conditionMet: true,
                included: false,
                attention: "none",
            };
            groups[key] = inactive;
            return inactive;
        }
        let included = false;
        let attention = group.condition === undefined ? "none" : "conditional";
        for (const item of groupItems(group)) {
            if (item.type === "phrase") {
                const phrase = phrases[phraseKey(item.id, instanceId)];
                included ||= phrase?.effectiveIncluded === true;
                if (phrase?.visible === true) {
                    attention = strongestAttention(attention, phrase.attention);
                }
                continue;
            }
            const child = resolveGroup(item.id, instanceId);
            included ||= child.included;
            attention = strongestAttention(attention, child.attention);
        }
        const presence = {
            applicable,
            enabled,
            conditionMet,
            included,
            attention,
        };
        groups[key] = presence;
        return presence;
    };
    for (const [groupId, group] of Object.entries(definitions.groups)) {
        if (!repeatedGroups.has(groupId) || group.repeatable !== undefined) {
            resolveGroup(groupId);
        }
    }
    for (const [groupId, instanceIds] of Object.entries(state.groupInstances)) {
        for (const instanceId of instanceIds)
            resolveGroup(groupId, instanceId);
    }
    return { phrases, groups };
};
export const isGroupEnabled = (groupId, definitions, state, instanceId, activeLens = "") => {
    const scope = scopeState(state, instanceId);
    return (groupApplicable(definitions.groups[groupId], activeLens) &&
        scopeGroupEnabled(groupId, definitions, scope, activeLens));
};
export const isGroupConditionMet = (groupId, resolved, instanceId) => resolved.groups[phraseKey(groupId, instanceId)]?.conditionMet ?? false;
export const isConditionMet = (condition, resolved, instanceId) => {
    return conditionMatches(condition, resolved.phrases, instanceId);
};
const collectGroupPhrases = (groupId, definitions, state, resolved, instanceId) => {
    if (resolved.groups[phraseKey(groupId, instanceId)]?.enabled !== true)
        return [];
    if (!isGroupConditionMet(groupId, resolved, instanceId))
        return [];
    const group = definitions.groups[groupId];
    return groupItems(group).flatMap((item) => {
        if (item.type === "phrase") {
            const phrase = resolved.phrases[phraseKey(item.id, instanceId)];
            return phrase === undefined ? [] : [phrase];
        }
        const child = item.id;
        const childGroup = definitions.groups[child];
        if (childGroup.repeatable !== undefined && instanceId === undefined) {
            return (state.groupInstances[child] ?? []).flatMap((childInstance) => collectGroupPhrases(child, definitions, state, resolved, childInstance));
        }
        return collectGroupPhrases(child, definitions, state, resolved, instanceId);
    });
};
const collectDisplayGroupPhrases = (groupId, definitions, state, resolved, instanceId) => {
    if (!isGroupConditionMet(groupId, resolved, instanceId))
        return [];
    const group = definitions.groups[groupId];
    return groupItems(group).flatMap((item) => {
        if (item.type === "phrase") {
            const phrase = resolved.phrases[phraseKey(item.id, instanceId)];
            return phrase === undefined ? [] : [phrase];
        }
        const child = item.id;
        const childGroup = definitions.groups[child];
        if (childGroup.repeatable !== undefined && instanceId === undefined) {
            return (state.groupInstances[child] ?? []).flatMap((childInstance) => collectDisplayGroupPhrases(child, definitions, state, resolved, childInstance));
        }
        return collectDisplayGroupPhrases(child, definitions, state, resolved, instanceId);
    });
};
export const groupPhrasePresence = (groupId, resolved, instanceId) => resolved.groups[phraseKey(groupId, instanceId)] ?? {
    included: false,
    attention: "none",
};
export const summarizeGroup = (groupId, definitions, state, resolved) => {
    const unique = new Map(collectGroupPhrases(groupId, definitions, state, resolved).map((phrase) => [
        phrase.key,
        phrase,
    ]));
    return [...unique.values()].filter((phrase) => phrase.effectiveIncluded && phrase.kind === "abnormal");
};
const collectSummaryGroupIds = (groupId, definitions, state, resolved, instanceId) => {
    if (resolved.groups[phraseKey(groupId, instanceId)]?.enabled !== true)
        return [];
    if (!isGroupConditionMet(groupId, resolved, instanceId))
        return [];
    const group = definitions.groups[groupId];
    return [
        ...(group.summary === true ? [groupId] : []),
        ...groupItems(group).flatMap((item) => item.type === "group" &&
            definitions.groups[item.id].repeatable === undefined
            ? collectSummaryGroupIds(item.id, definitions, state, resolved, instanceId)
            : []),
    ];
};
const renderGroupTextInternal = (groupId, definitions, state, resolved, instanceId, instanceIndex) => {
    if (resolved.groups[phraseKey(groupId, instanceId)]?.enabled !== true)
        return "";
    if (!isGroupConditionMet(groupId, resolved, instanceId))
        return "";
    const group = definitions.groups[groupId];
    const baseTitle = parseValue(group.title).text;
    const title = instanceIndex === undefined ? baseTitle : `${baseTitle} ${instanceIndex + 1}`;
    const heading = groupHeading(title);
    const phrases = groupItems(group)
        .filter((item) => item.type === "phrase")
        .map((item) => item.id)
        .map((id) => resolved.phrases[phraseKey(id, instanceId)])
        .filter((phrase) => phrase?.effectiveIncluded === true)
        .map((phrase) => phrase.text);
    const children = groupItems(group)
        .filter((item) => item.type === "group")
        .map((item) => item.id)
        .flatMap((child) => {
        const childGroup = definitions.groups[child];
        if (childGroup.repeatable !== undefined && instanceId === undefined) {
            return (state.groupInstances[child] ?? []).map((childInstance, index) => renderGroupTextInternal(child, definitions, state, resolved, childInstance, index));
        }
        return [
            renderGroupTextInternal(child, definitions, state, resolved, instanceId),
        ];
    })
        .filter(Boolean);
    const own = phrases.length > 0 ? `${heading} ${phrases.join("; ")};` : "";
    if (own !== "" && children.length > 0)
        return `${own}\n${children.join("\n")}`;
    if (own !== "")
        return own;
    if (children.length > 0)
        return `${heading}\n${children.join("\n")}`;
    if (groupItems(group).some((item) => item.type === "phrase")) {
        return group.content ?? "";
    }
    return group.content === undefined ? heading : `${heading}\n${group.content}`;
};
export const renderGroupText = (groupId, definitions, state, resolved) => renderGroupTextInternal(groupId, definitions, state, resolved);
const exportAttributes = (values) => Object.fromEntries(Object.entries(values).map(([id, value]) => [
    id,
    isDurationValue(value)
        ? { ...value, resolvedStart: resolvedStart(value) }
        : value,
]));
const summaryItem = (phrase) => ({
    id: phrase.id,
    ...(phrase.instanceId === undefined ? {} : { instanceId: phrase.instanceId }),
    valueId: phrase.valueId,
    text: phrase.text,
    kind: phrase.kind,
    source: phrase.source,
    provenance: [...phrase.provenance],
    attributes: exportAttributes(phrase.attributes),
});
export const structuredDocument = (root, definitions, state, resolved) => {
    const all = [
        ...new Map(collectDisplayGroupPhrases(root, definitions, state, resolved).map((phrase) => [phrase.key, phrase])).values(),
    ];
    const item = (phrase) => ({
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
        version: 2,
        root,
        text: renderGroupText(root, definitions, state, resolved),
        items: all.filter((phrase) => phrase.effectiveIncluded).map(item),
        pending: all
            .filter((phrase) => phrase.visible && phrase.attention !== "none")
            .map((phrase) => ({
            ...summaryItem(phrase),
            attention: phrase.attention,
        })),
        summaries: collectSummaryGroupIds(root, definitions, state, resolved).map((groupId) => ({
            groupId,
            title: parseValue(definitions.groups[groupId].title).text,
            items: summarizeGroup(groupId, definitions, state, resolved).map(summaryItem),
        })),
    };
};
