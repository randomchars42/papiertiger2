import { loadJSON } from "@lib/base.js";
import { copyToClipboard } from "@lib/dom.js";
import { isRecord } from "@lib/guards.js";
import { getSymptomLens } from "@lib/symptomlens.js";
import { getConfig } from "../../config.js";
import { attributePlaceholders, clampNumber, dateTimeValue, editorDefaultValue, emptyDefinitions, hasAttributeValue, isDurationValue, parseValue, } from "./textblocklib.js";
import { createDocumentState, createScopeState, groupItems, isConditionMet, isGroupConditionMet, isGroupEnabled, isPackage, mergePackage, phraseKey, renderGroupText, resolveDocument, scopeState, structuredDocument, } from "./textblockstate.js";
import { renderModule, renderPhraseEditor } from "./textblockui.js";
const definitions = emptyDefinitions();
const state = createDocumentState();
const modules = new Map();
const loadedPackages = new Set();
const packageRequests = new Map();
let resolved = { phrases: {}, groups: {} };
let instanceCounter = 0;
const suggestionHighlightDuration = 1_600;
const requestPackage = (id) => {
    let request = packageRequests.get(id);
    if (request !== undefined)
        return request;
    request = (async () => {
        const data = await loadJSON(`${getConfig("dataURL").replace(/\/$/, "")}/${id}.json`);
        if (!isPackage(data)) {
            throw new Error(`Data file "${id}.json" is not a version 2 package`);
        }
        return data;
    })();
    packageRequests.set(id, request);
    return request;
};
const fetchPackage = async (id, trail = []) => {
    if (loadedPackages.has(id))
        return;
    if (trail.includes(id)) {
        throw new Error(`Package import cycle: ${[...trail, id].join(" -> ")}`);
    }
    const data = await requestPackage(id);
    for (const importedId of data.imports ?? []) {
        await fetchPackage(importedId, [...trail, id]);
    }
    if (loadedPackages.has(id))
        return;
    mergePackage(definitions, data);
    loadedPackages.add(id);
};
const ensureGroup = async (id, trail = new Set()) => {
    if (!(id in definitions.groups))
        await fetchPackage(id);
    const group = definitions.groups[id];
    if (group === undefined)
        throw new Error(`Group "${id}" was not found`);
    if (trail.has(id))
        throw new Error(`Group cycle detected at "${id}"`);
    const nextTrail = new Set(trail).add(id);
    for (const item of groupItems(group)) {
        if (item.type === "group") {
            await ensureGroup(item.id, nextTrail);
        }
        else {
            if (!(item.id in definitions.phrases))
                await fetchPackage(item.id);
            const phrase = definitions.phrases[item.id];
            if (phrase === undefined) {
                throw new Error(`Phrase "${item.id}" was not found`);
            }
            for (const editorId of Object.values(phrase.attributes ?? {})) {
                if (!(editorId in definitions.editors))
                    await fetchPackage(editorId);
            }
        }
    }
    for (const setId of group.sets ?? []) {
        if (!(setId in definitions.sets))
            await fetchPackage(setId);
    }
};
const nextInstanceId = (groupId) => {
    instanceCounter += 1;
    const suffix = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${instanceCounter}`;
    return `${groupId}-${suffix}`;
};
const addGroupInstance = (groupId) => {
    const group = definitions.groups[groupId];
    if (group?.repeatable === undefined) {
        throw new Error(`Group "${groupId}" is not repeatable`);
    }
    const instanceId = nextInstanceId(groupId);
    state.groupInstances[groupId] ??= [];
    state.groupInstances[groupId].push(instanceId);
    state.instanceStates[instanceId] = createScopeState();
    return instanceId;
};
const initialiseRepeatables = (groupId) => {
    const group = definitions.groups[groupId];
    for (const item of groupItems(group)) {
        if (item.type === "phrase")
            continue;
        const child = item.id;
        const childGroup = definitions.groups[child];
        if (childGroup.repeatable !== undefined) {
            if (state.groupInstances[child] === undefined) {
                state.groupInstances[child] = [];
                for (let index = 0; index < (childGroup.repeatable.initial ?? 0); index += 1) {
                    addGroupInstance(child);
                }
            }
        }
        else {
            initialiseRepeatables(child);
        }
    }
};
const renderAll = () => {
    resolved = resolveDocument(definitions, state, getSymptomLens());
    const now = performance.now();
    const currentSuggestions = new Set(Object.values(resolved.phrases)
        .filter((phrase) => phrase.visible &&
        !phrase.effectiveIncluded &&
        phrase.source === "suggestion")
        .map((phrase) => phrase.key));
    for (const module of modules.values()) {
        const parent = document.getElementById(module.parentId);
        if (parent === null)
            continue;
        const revealedPaths = [];
        if (module.suggestionsReady) {
            for (const key of currentSuggestions) {
                if (!module.suggestionKeys.has(key)) {
                    module.suggestionHighlights.set(key, now + suggestionHighlightDuration);
                    const phrase = resolved.phrases[key];
                    if (phrase !== undefined) {
                        const path = holdOpenForSuggestion(module, phrase);
                        if (path !== null)
                            revealedPaths.push(path);
                    }
                }
            }
        }
        else {
            module.suggestionsReady = true;
        }
        for (const key of module.suggestionKeys) {
            if (!currentSuggestions.has(key)) {
                releaseRevealHold(module, suggestionHoldKey(key), true);
            }
        }
        module.suggestionKeys = currentSuggestions;
        revealedPaths.push(...refreshExplicitReveals(module));
        for (const [key, expires] of module.suggestionHighlights) {
            if (!currentSuggestions.has(key) || expires <= now) {
                module.suggestionHighlights.delete(key);
            }
        }
        renderModule(parent, module.rootId, definitions, state, resolved, module.openEditor, new Set(module.suggestionHighlights.keys()), module.compactOverrides, module.status, module.controls, module.pickerQueries);
        for (const path of revealedPaths) {
            const group = path[path.length - 1];
            if (group !== undefined) {
                animateGroupTransition(module, group.groupId, group.instanceId, "expanding");
            }
        }
    }
    const suggestions = new Map();
    for (const phrase of Object.values(resolved.phrases)) {
        if (!phrase.effectiveIncluded || phrase.valueId === null)
            continue;
        const value = definitions.phrases[phrase.id]?.values[phrase.valueId];
        for (const mapping of value?.cedis ?? []) {
            const current = suggestions.get(mapping.code) ?? {
                code: mapping.code,
                sources: [],
                relations: [],
            };
            if (!current.sources.includes(phrase.text)) {
                current.sources.push(phrase.text);
            }
            if (!current.relations.includes(mapping.relation)) {
                current.relations.push(mapping.relation);
            }
            suggestions.set(mapping.code, current);
        }
    }
    const source = [...modules.values()]
        .map((module) => document.getElementById(module.parentId))
        .find((parent) => parent !== null);
    source?.dispatchEvent(new CustomEvent("papiertiger:plugin-message", {
        bubbles: true,
        detail: {
            type: "cedis-suggestions",
            payload: { id: "cedis", suggestions: [...suggestions.values()] },
        },
    }));
};
const scopeFor = (instanceId) => scopeState(state, instanceId);
const currentPhrase = (phraseId, instanceId) => resolved.phrases[phraseKey(phraseId, instanceId)];
const completePrompt = (phraseId, instanceId) => {
    if (definitions.phrases[phraseId]?.prompt !== true)
        return;
    const scope = scopeFor(instanceId);
    if (!scope.completedPrompts.includes(phraseId)) {
        scope.completedPrompts.push(phraseId);
    }
};
const resetPrompt = (phraseId, instanceId) => {
    const scope = scopeFor(instanceId);
    scope.completedPrompts = scope.completedPrompts.filter((candidate) => candidate !== phraseId);
};
const nextPromptInGroup = (module, groupId, instanceId) => {
    if (!isGroupEnabled(groupId, definitions, state, instanceId, getSymptomLens())) {
        return null;
    }
    if (!isGroupConditionMet(groupId, resolved, instanceId)) {
        return null;
    }
    const group = definitions.groups[groupId];
    const compact = module.compactOverrides[phraseKey(groupId, instanceId)] ??
        groupStartsCompact(module, groupId, instanceId);
    if (compact)
        return null;
    const scope = scopeFor(instanceId);
    for (const item of groupItems(group)) {
        if (item.type === "phrase") {
            const phrase = currentPhrase(item.id, instanceId);
            if (definitions.phrases[item.id].prompt === true &&
                phrase?.visible === true &&
                !scope.completedPrompts.includes(item.id)) {
                return {
                    type: "phrase",
                    phraseId: item.id,
                    ...(instanceId === undefined ? {} : { instanceId }),
                };
            }
            continue;
        }
        const childId = item.id;
        const child = definitions.groups[childId];
        if (child.repeatable !== undefined && instanceId === undefined) {
            for (const childInstanceId of state.groupInstances[childId] ?? []) {
                const prompt = nextPromptInGroup(module, childId, childInstanceId);
                if (prompt !== null)
                    return prompt;
            }
        }
        else {
            const prompt = nextPromptInGroup(module, childId, instanceId);
            if (prompt !== null)
                return prompt;
        }
    }
    return null;
};
const openNextPrompt = (module) => {
    if (module.openEditor !== null)
        return false;
    const prompt = nextPromptInGroup(module, module.rootId);
    if (prompt === null)
        return false;
    module.openEditor = prompt;
    return true;
};
const setOverride = (phraseId, valueId, included, instanceId, provenance) => {
    const scope = scopeFor(instanceId);
    scope.phraseOverrides[phraseId] = { valueId, included };
    if (provenance === undefined) {
        delete scope.acceptedProvenance[phraseId];
    }
    else {
        scope.acceptedProvenance[phraseId] = [...provenance];
    }
};
const requiredAttributes = (phraseId, valueId) => {
    if (valueId === null)
        return [];
    const value = definitions.phrases[phraseId].values[valueId];
    if (value === undefined)
        return [];
    return attributePlaceholders(parseValue(value).text)
        .filter((placeholder) => placeholder.required)
        .map((placeholder) => placeholder.id);
};
const missingAttribute = (phraseId, valueId, instanceId) => {
    const values = scopeFor(instanceId).attributes[phraseId] ?? {};
    return requiredAttributes(phraseId, valueId).find((attributeId) => !hasAttributeValue(values[attributeId]));
};
const activatePhrase = (phraseId, instanceId) => {
    const scope = scopeFor(instanceId);
    const phrase = currentPhrase(phraseId, instanceId);
    const definition = definitions.phrases[phraseId];
    const values = Object.keys(definition.values);
    const defaultValue = definition.default === "" || definition.default === null
        ? undefined
        : definition.default;
    setOverride(phraseId, scope.phraseOverrides[phraseId]?.valueId ??
        phrase?.valueId ??
        defaultValue ??
        values[0] ??
        null, true, instanceId);
};
const updateAttribute = (phraseId, attributeId, value, instanceId) => {
    const scope = scopeFor(instanceId);
    scope.attributes[phraseId] ??= {};
    scope.attributes[phraseId][attributeId] = value;
    activatePhrase(phraseId, instanceId);
};
const openAttribute = (module, phraseId, attributeId, instanceId) => {
    const editorId = definitions.phrases[phraseId].attributes?.[attributeId];
    const editor = definitions.editors[editorId ?? ""];
    if (editor === undefined)
        return;
    const scope = scopeFor(instanceId);
    if (scope.attributes[phraseId]?.[attributeId] === undefined) {
        const initial = editorDefaultValue(editor);
        if (initial !== undefined) {
            updateAttribute(phraseId, attributeId, initial, instanceId);
        }
        else {
            activatePhrase(phraseId, instanceId);
        }
    }
    else {
        activatePhrase(phraseId, instanceId);
    }
    module.openEditor = {
        type: "attribute",
        phraseId,
        attributeId,
        ...(instanceId === undefined ? {} : { instanceId }),
    };
};
const selectValue = (module, phraseId, valueId, instanceId) => {
    setOverride(phraseId, valueId, true, instanceId);
    completePrompt(phraseId, instanceId);
    const missing = missingAttribute(phraseId, valueId, instanceId);
    if (missing !== undefined) {
        openAttribute(module, phraseId, missing, instanceId);
    }
    else {
        module.openEditor = null;
    }
    delete module.pickerQueries[phraseKey(phraseId, instanceId)];
};
const handlePhrase = (module, phraseId, instanceId) => {
    const phrase = currentPhrase(phraseId, instanceId);
    const values = Object.keys(definitions.phrases[phraseId].values);
    if (phrase === undefined)
        return;
    if (phrase.valueId === null) {
        if (values.length === 1) {
            selectValue(module, phraseId, values[0], instanceId);
        }
        else {
            module.openEditor = {
                type: "phrase",
                phraseId,
                ...(instanceId === undefined ? {} : { instanceId }),
            };
        }
        return;
    }
    if (!phrase.included) {
        selectValue(module, phraseId, phrase.valueId, instanceId);
        return;
    }
    if (values.length <= 1) {
        setOverride(phraseId, phrase.valueId, false, instanceId);
        module.openEditor = null;
        return;
    }
    if (values.length === 2) {
        const current = Math.max(0, values.indexOf(phrase.valueId));
        selectValue(module, phraseId, values[(current + 1) % values.length], instanceId);
        return;
    }
    module.openEditor = {
        type: "phrase",
        phraseId,
        ...(instanceId === undefined ? {} : { instanceId }),
    };
};
const defaultDuration = (editor) => ({
    amount: 1,
    unit: editor.defaultUnit ?? editor.units?.[0] ?? "day",
    anchor: new Date().toISOString(),
});
const currentDuration = (phraseId, attributeId, editor, instanceId) => {
    const value = scopeFor(instanceId).attributes[phraseId]?.[attributeId];
    return isDurationValue(value) ? value : defaultDuration(editor);
};
const getEditor = (phraseId, attributeId) => {
    const editorId = definitions.phrases[phraseId]?.attributes?.[attributeId];
    return definitions.editors[editorId ?? ""];
};
const clearAttribute = (phraseId, attributeId, instanceId, deactivateIncompletePhrase = true) => {
    const scope = scopeFor(instanceId);
    delete scope.attributes[phraseId]?.[attributeId];
    if (Object.keys(scope.attributes[phraseId] ?? {}).length === 0) {
        delete scope.attributes[phraseId];
    }
    if (deactivateIncompletePhrase) {
        delete scope.phraseOverrides[phraseId];
        delete scope.acceptedProvenance[phraseId];
    }
};
const selectedValueId = (phraseId, instanceId) => scopeFor(instanceId).phraseOverrides[phraseId]?.valueId ??
    currentPhrase(phraseId, instanceId)?.valueId ??
    null;
const advanceRequiredAttribute = (module, phraseId, instanceId) => {
    const missing = missingAttribute(phraseId, selectedValueId(phraseId, instanceId), instanceId);
    if (missing === undefined) {
        module.openEditor = null;
    }
    else {
        openAttribute(module, phraseId, missing, instanceId);
    }
};
const openFirstRequiredInGroup = (module, groupId, instanceId) => {
    const group = definitions.groups[groupId];
    for (const item of groupItems(group)) {
        if (item.type === "phrase") {
            const definition = definitions.phrases[item.id];
            const valueId = definition.default === "" || definition.default === null
                ? null
                : definition.default;
            const missing = missingAttribute(item.id, valueId, instanceId);
            if (missing !== undefined) {
                openAttribute(module, item.id, missing, instanceId);
                return true;
            }
            continue;
        }
        const childId = item.id;
        if (definitions.groups[childId].repeatable === undefined &&
            openFirstRequiredInGroup(module, childId, instanceId)) {
            return true;
        }
    }
    return false;
};
const closeEditor = (module) => {
    const editor = module.openEditor;
    if (editor?.type === "phrase") {
        completePrompt(editor.phraseId, editor.instanceId);
        delete module.pickerQueries[phraseKey(editor.phraseId, editor.instanceId)];
        module.openEditor = null;
        return;
    }
    if (editor?.type !== "attribute") {
        module.openEditor = null;
        return;
    }
    const scope = scopeFor(editor.instanceId);
    const value = scope.attributes[editor.phraseId]?.[editor.attributeId];
    if (!hasAttributeValue(value)) {
        const required = requiredAttributes(editor.phraseId, selectedValueId(editor.phraseId, editor.instanceId)).includes(editor.attributeId);
        clearAttribute(editor.phraseId, editor.attributeId, editor.instanceId, required);
        if (required) {
            module.openEditor = null;
        }
        else {
            advanceRequiredAttribute(module, editor.phraseId, editor.instanceId);
        }
        return;
    }
    const phrase = currentPhrase(editor.phraseId, editor.instanceId);
    const missing = missingAttribute(editor.phraseId, phrase?.valueId ?? null, editor.instanceId);
    module.openEditor =
        missing === undefined
            ? null
            : {
                type: "attribute",
                phraseId: editor.phraseId,
                attributeId: missing,
                ...(editor.instanceId === undefined
                    ? {}
                    : { instanceId: editor.instanceId }),
            };
};
const dismissEditor = (module) => {
    if (module.openEditor === null)
        return false;
    closeEditor(module);
    module.openEditor = null;
    return true;
};
const targetIsInsideOpenEditor = (module, target) => {
    const editor = module.openEditor;
    if (editor === null)
        return false;
    const key = phraseKey(editor.phraseId, editor.instanceId);
    const inlineEditor = target.closest(".inline-editor[data-editor-for]");
    if (inlineEditor?.dataset.editorFor === key)
        return true;
    const phrase = target.closest(".phrase[data-phrase-id]");
    return (phrase?.dataset.phraseId === editor.phraseId &&
        phrase.dataset.instanceId === editor.instanceId);
};
const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const focusOpenEditor = (module) => {
    const editor = module.openEditor;
    const parent = document.getElementById(module.parentId);
    if (editor?.type === "phrase") {
        if (definitions.phrases[editor.phraseId]?.catalog === undefined)
            return;
        const search = [...(parent?.querySelectorAll('input[data-input="catalog-search"]') ?? [])].find((field) => field.dataset.phraseId === editor.phraseId &&
            field.dataset.instanceId === editor.instanceId);
        search?.focus();
        search?.setSelectionRange(search.value.length, search.value.length);
        return;
    }
    if (isTouchDevice() || editor?.type !== "attribute")
        return;
    const input = [...(parent?.querySelectorAll('input[data-input="attribute"]') ?? [])].find((field) => field.dataset.phraseId === editor.phraseId &&
        field.dataset.attributeId === editor.attributeId &&
        field.dataset.instanceId === editor.instanceId);
    input?.focus();
};
const selectInitialInputValue = (target) => {
    if (!(target instanceof HTMLInputElement) ||
        target.dataset.input !== "attribute" ||
        target.dataset.selectOnFocus !== "true") {
        return;
    }
    delete target.dataset.selectOnFocus;
    requestAnimationFrame(() => {
        if (target.isConnected &&
            document.activeElement === target &&
            target.value !== "") {
            target.select();
        }
    });
};
const resetInstance = (instanceId) => {
    if (state.instanceStates[instanceId] !== undefined) {
        state.instanceStates[instanceId] = createScopeState();
    }
};
const resetStaticGroup = (groupId) => {
    const group = definitions.groups[groupId];
    for (const item of groupItems(group)) {
        if (item.type === "phrase") {
            delete state.phraseOverrides[item.id];
            delete state.attributes[item.id];
            delete state.acceptedProvenance[item.id];
            resetPrompt(item.id);
            continue;
        }
        const child = item.id;
        const childGroup = definitions.groups[child];
        if (childGroup.repeatable !== undefined) {
            for (const instanceId of state.groupInstances[child] ?? []) {
                delete state.instanceStates[instanceId];
            }
            state.groupInstances[child] = [];
            for (let index = 0; index < (childGroup.repeatable.initial ?? 0); index += 1) {
                addGroupInstance(child);
            }
        }
        else {
            resetStaticGroup(child);
        }
    }
    for (const setId of group.sets ?? []) {
        state.activeSets = state.activeSets.filter((id) => id !== setId);
    }
    delete state.groupOverrides[groupId];
};
const requireData = (button, key) => {
    const value = button.dataset[key];
    if (value === undefined)
        throw new Error(`Missing action data "${key}"`);
    return value;
};
const instanceData = (button) => button.dataset.instanceId;
const configuredAutoCompactDelay = () => {
    const seconds = getConfig("autoCompactSeconds");
    if (!Number.isFinite(seconds) || seconds < 0) {
        throw new Error('Die Konfiguration "autoCompactSeconds" muss eine nicht negative Zahl sein.');
    }
    return seconds === 0 ? null : seconds * 1_000;
};
const groupContainsPhrase = (groupId, phraseId) => groupItems(definitions.groups[groupId]).some((item) => item.type === "phrase"
    ? item.id === phraseId
    : groupContainsPhrase(item.id, phraseId));
const groupContainsGroup = (groupId, childId) => groupId === childId ||
    groupItems(definitions.groups[groupId]).some((item) => item.type === "group" && groupContainsGroup(item.id, childId));
const instanceGroup = (instanceId) => Object.entries(state.groupInstances).find(([, instanceIds]) => instanceIds.includes(instanceId))?.[0];
const groupPathToPhrase = (groupId, phraseId, targetInstanceId, instanceId) => {
    const context = {
        groupId,
        ...(instanceId === undefined ? {} : { instanceId }),
    };
    for (const item of groupItems(definitions.groups[groupId])) {
        if (item.type === "phrase") {
            if (item.id === phraseId && instanceId === targetInstanceId) {
                return [context];
            }
            continue;
        }
        const child = definitions.groups[item.id];
        let childInstanceId = instanceId;
        if (child.repeatable !== undefined && instanceId === undefined) {
            if (targetInstanceId === undefined ||
                !(state.groupInstances[item.id] ?? []).includes(targetInstanceId)) {
                continue;
            }
            childInstanceId = targetInstanceId;
        }
        const childPath = groupPathToPhrase(item.id, phraseId, targetInstanceId, childInstanceId);
        if (childPath !== null)
            return [context, ...childPath];
    }
    return null;
};
const expandOpenEditorPath = (module) => {
    const editor = module.openEditor;
    if (editor === null)
        return null;
    const path = groupPathToPhrase(module.rootId, editor.phraseId, editor.instanceId);
    if (path === null)
        return null;
    let deepestExpanded = null;
    for (const context of path) {
        const key = phraseKey(context.groupId, context.instanceId);
        const compact = module.compactOverrides[key] ??
            groupStartsCompact(module, context.groupId, context.instanceId);
        cancelAutoCompact(module, context.groupId, context.instanceId);
        module.compactOverrides[key] = false;
        if (compact)
            deepestExpanded = context;
    }
    return deepestExpanded;
};
const allGroupPaths = (groupId, instanceId, prefix = []) => {
    const context = {
        groupId,
        ...(instanceId === undefined ? {} : { instanceId }),
    };
    const path = [...prefix, context];
    const paths = [path];
    for (const item of groupItems(definitions.groups[groupId])) {
        if (item.type === "phrase")
            continue;
        const child = definitions.groups[item.id];
        if (child.repeatable !== undefined && instanceId === undefined) {
            for (const childInstanceId of state.groupInstances[item.id] ?? []) {
                paths.push(...allGroupPaths(item.id, childInstanceId, path));
            }
        }
        else {
            paths.push(...allGroupPaths(item.id, instanceId, path));
        }
    }
    return paths;
};
const groupPathToGroup = (module, groupId, instanceId) => allGroupPaths(module.rootId).find((path) => {
    const context = path[path.length - 1];
    return context?.groupId === groupId && context.instanceId === instanceId;
});
const groupStartsCompact = (module, groupId, instanceId) => groupPathToGroup(module, groupId, instanceId)?.some((context) => definitions.groups[context.groupId].autoCompact === true) ?? definitions.groups[groupId].autoCompact === true;
const expandGroupPath = (module, path) => {
    for (const context of path) {
        cancelAutoCompact(module, context.groupId, context.instanceId);
        module.compactOverrides[phraseKey(context.groupId, context.instanceId)] = false;
    }
};
const suggestionHoldKey = (key) => `suggestion:${key}`;
const conditionHoldKey = (groupKey) => `condition:${groupKey}`;
const initialHoldKey = (groupKey) => `initial:${groupKey}`;
const holdOpen = (module, holdKey, path) => {
    const heldPath = path.map(({ groupId, instanceId }) => phraseKey(groupId, instanceId));
    for (const key of heldPath) {
        let groupState = module.revealGroups.get(key);
        if (groupState === undefined) {
            const hadOverride = Object.prototype.hasOwnProperty.call(module.compactOverrides, key);
            groupState = {
                holds: new Set(),
                hadOverride,
                ...(hadOverride
                    ? { value: module.compactOverrides[key] }
                    : {}),
            };
            module.revealGroups.set(key, groupState);
        }
        groupState.holds.add(holdKey);
    }
    module.revealHolds.set(holdKey, heldPath);
    for (const { groupId, instanceId } of path) {
        cancelAutoCompact(module, groupId, instanceId);
        module.compactOverrides[phraseKey(groupId, instanceId)] = false;
    }
};
const releaseRevealHold = (module, holdKey, restore) => {
    const path = module.revealHolds.get(holdKey);
    if (path === undefined)
        return;
    module.revealHolds.delete(holdKey);
    for (const key of path) {
        const groupState = module.revealGroups.get(key);
        if (groupState === undefined)
            continue;
        groupState.holds.delete(holdKey);
        if (groupState.holds.size > 0)
            continue;
        module.revealGroups.delete(key);
        if (!restore)
            continue;
        if (groupState.hadOverride) {
            module.compactOverrides[key] = groupState.value ?? false;
        }
        else {
            delete module.compactOverrides[key];
        }
    }
};
const holdOpenForSuggestion = (module, phrase) => {
    const path = groupPathToPhrase(module.rootId, phrase.id, phrase.instanceId);
    if (path === null)
        return null;
    holdOpen(module, suggestionHoldKey(phrase.key), path);
    return path;
};
const holdInitialReveals = (module) => {
    for (const path of allGroupPaths(module.rootId)) {
        const context = path[path.length - 1];
        if (context === undefined ||
            definitions.groups[context.groupId].reveal !== "initial") {
            continue;
        }
        const groupKey = phraseKey(context.groupId, context.instanceId);
        holdOpen(module, initialHoldKey(groupKey), path);
    }
};
const refreshExplicitReveals = (module) => {
    const revealed = [];
    if (!Object.values(definitions.groups).some((group) => group.reveal !== undefined && group.reveal !== "initial")) {
        return revealed;
    }
    const present = new Set();
    for (const path of allGroupPaths(module.rootId)) {
        const context = path[path.length - 1];
        if (context === undefined)
            continue;
        const condition = definitions.groups[context.groupId].reveal;
        if (condition === undefined || condition === "initial")
            continue;
        const groupKey = phraseKey(context.groupId, context.instanceId);
        const holdKey = conditionHoldKey(groupKey);
        present.add(holdKey);
        const met = isConditionMet(condition, resolved, context.instanceId);
        const previous = module.revealConditionStates.get(holdKey);
        module.revealConditionStates.set(holdKey, met);
        if (!met) {
            releaseRevealHold(module, holdKey, true);
        }
        else if (previous !== true) {
            holdOpen(module, holdKey, path);
            revealed.push(path);
        }
    }
    for (const key of module.revealConditionStates.keys()) {
        if (present.has(key))
            continue;
        module.revealConditionStates.delete(key);
        releaseRevealHold(module, key, true);
    }
    return revealed;
};
const groupIsHeldOpen = (module, groupId, instanceId) => {
    const key = phraseKey(groupId, instanceId);
    return module.revealGroups.has(key);
};
const elementGroupPath = (target, parent) => {
    const path = [];
    let node = target.closest(".group[data-group-id]");
    while (node !== null && parent.contains(node)) {
        const groupId = node.dataset.groupId;
        if (groupId !== undefined) {
            path.unshift(phraseKey(groupId, node.dataset.instanceId));
        }
        node = node.parentElement?.closest(".group[data-group-id]") ?? null;
    }
    return path;
};
const isPathPrefix = (prefix, path) => prefix.length <= path.length &&
    prefix.every((key, index) => path[index] === key);
const releaseRevealHoldsForTarget = (module, target) => {
    if (!(target instanceof Element))
        return;
    const parent = document.getElementById(module.parentId);
    if (parent === null || !parent.contains(target))
        return;
    const targetPath = elementGroupPath(target, parent);
    for (const [holdKey, heldPath] of module.revealHolds) {
        if (isPathPrefix(heldPath, targetPath) ||
            isPathPrefix(targetPath, heldPath)) {
            releaseRevealHold(module, holdKey, false);
        }
    }
};
const editorIsInsideGroup = (module, groupId, instanceId) => {
    const editor = module.openEditor;
    if (editor === null)
        return false;
    if (editor.instanceId === instanceId) {
        return groupContainsPhrase(groupId, editor.phraseId);
    }
    if (instanceId !== undefined || editor.instanceId === undefined)
        return false;
    const repeatedGroup = instanceGroup(editor.instanceId);
    return (repeatedGroup !== undefined &&
        groupContainsGroup(groupId, repeatedGroup) &&
        groupContainsPhrase(repeatedGroup, editor.phraseId));
};
const cancelAutoCompact = (module, groupId, instanceId) => {
    const key = phraseKey(groupId, instanceId);
    const timer = module.autoCompactTimers.get(key);
    if (timer !== undefined)
        window.clearTimeout(timer);
    module.autoCompactTimers.delete(key);
};
const clearAutoCompactTimers = (module, instanceId) => {
    for (const [key, timer] of module.autoCompactTimers) {
        if (instanceId !== undefined && !key.startsWith(`${instanceId}:`))
            continue;
        window.clearTimeout(timer);
        module.autoCompactTimers.delete(key);
    }
};
const closestParentGroup = (node) => node.parentElement?.closest(".group[data-group-id]") ?? null;
const compactFlowSiblings = (module, node) => {
    const parentGroup = closestParentGroup(node);
    const parentGroupId = parentGroup?.dataset.groupId;
    if (parentGroup === null ||
        parentGroupId === undefined ||
        (definitions.groups[parentGroupId]?.subgroups ?? "flow") !== "flow") {
        return;
    }
    for (const sibling of parentGroup.querySelectorAll(".group[data-group-id]")) {
        if (sibling === node || closestParentGroup(sibling) !== parentGroup)
            continue;
        const groupId = sibling.dataset.groupId;
        if (groupId === undefined)
            continue;
        const instanceId = sibling.dataset.instanceId;
        cancelAutoCompact(module, groupId, instanceId);
        module.compactOverrides[phraseKey(groupId, instanceId)] = true;
    }
};
const autoCompactContext = (module, target, parent) => {
    if (module.autoCompactDelay === null)
        return null;
    let node = target.closest(".group[data-group-id]");
    while (node !== null && parent.contains(node)) {
        const groupId = node.dataset.groupId;
        if (groupId !== undefined && definitions.groups[groupId]?.autoCompact === true) {
            return {
                groupId,
                ...(node.dataset.instanceId === undefined
                    ? {}
                    : { instanceId: node.dataset.instanceId }),
            };
        }
        node = node.parentElement?.closest(".group[data-group-id]") ?? null;
    }
    return null;
};
const cancelAutoCompactForTarget = (module, target) => {
    if (!(target instanceof Element))
        return;
    const parent = document.getElementById(module.parentId);
    if (parent === null || !parent.contains(target))
        return;
    const context = autoCompactContext(module, target, parent);
    if (context !== null) {
        cancelAutoCompact(module, context.groupId, context.instanceId);
    }
};
const parseCompactGroupPath = (value) => {
    const path = JSON.parse(value);
    if (!Array.isArray(path) ||
        path.length === 0 ||
        path.some((entry) => !isRecord(entry) ||
            typeof entry.groupId !== "string" ||
            definitions.groups[entry.groupId] === undefined ||
            (entry.instanceId !== undefined &&
                typeof entry.instanceId !== "string"))) {
        throw new Error("Ungültiger Gruppenpfad.");
    }
    return path;
};
const animateGroupTransition = (module, groupId, instanceId, direction = "expanding") => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        return;
    window.requestAnimationFrame(() => {
        const parent = document.getElementById(module.parentId);
        const group = [...(parent?.querySelectorAll(".group[data-group-id]") ?? [])].find((candidate) => candidate.dataset.groupId === groupId &&
            candidate.dataset.instanceId === instanceId);
        if (group === undefined)
            return;
        group.classList.remove("group--expanding", "group--compacting");
        const className = `group--${direction}`;
        group.classList.add(className);
        window.setTimeout(() => group.classList.remove(className), 940);
    });
};
const scheduleAutoCompact = (module, groupId, instanceId) => {
    cancelAutoCompact(module, groupId, instanceId);
    if (editorIsInsideGroup(module, groupId, instanceId))
        return;
    if (groupIsHeldOpen(module, groupId, instanceId))
        return;
    const key = phraseKey(groupId, instanceId);
    if (module.compactOverrides[key] ??
        groupStartsCompact(module, groupId, instanceId)) {
        return;
    }
    const delay = module.autoCompactDelay;
    if (delay === null)
        return;
    const timer = window.setTimeout(() => {
        module.autoCompactTimers.delete(key);
        if (editorIsInsideGroup(module, groupId, instanceId))
            return;
        if (groupIsHeldOpen(module, groupId, instanceId))
            return;
        if (instanceId !== undefined &&
            state.instanceStates[instanceId] === undefined) {
            return;
        }
        module.compactOverrides[key] = true;
        renderAll();
        animateGroupTransition(module, groupId, instanceId, "compacting");
    }, delay);
    module.autoCompactTimers.set(key, timer);
};
const restartAutoCompactForTarget = (module, target) => {
    if (!(target instanceof Element))
        return;
    const parent = document.getElementById(module.parentId);
    if (parent === null || !parent.contains(target))
        return;
    const context = autoCompactContext(module, target, parent);
    if (context !== null) {
        scheduleAutoCompact(module, context.groupId, context.instanceId);
    }
};
const activatingChildActions = new Set([
    "phrase",
    "choose-value",
    "choose-freetext",
    "attribute",
    "choose-attribute",
    "step-number",
    "step-duration",
    "choose-duration-unit",
    "clear-attribute",
    "toggle-set",
]);
const activateInactiveGroupPath = (module, target, parent) => {
    let deepestActivated = null;
    let node = target.closest(".group[data-group-id]");
    while (node !== null && parent.contains(node)) {
        const groupId = node.dataset.groupId;
        const instanceId = node.dataset.instanceId;
        if (groupId !== undefined &&
            !isGroupEnabled(groupId, definitions, state, instanceId, getSymptomLens())) {
            scopeFor(instanceId).groupOverrides[groupId] = true;
            cancelAutoCompact(module, groupId, instanceId);
            module.compactOverrides[phraseKey(groupId, instanceId)] = false;
            deepestActivated ??= {
                groupId,
                ...(instanceId === undefined ? {} : { instanceId }),
            };
        }
        node = node.parentElement?.closest(".group[data-group-id]") ?? null;
    }
    return deepestActivated;
};
const expandCompactedAutoCompactForAction = (module, button, action, parent) => {
    if (action === "toggle-compact" || action === "open-group-path")
        return null;
    const actionGroup = button.closest(".group[data-group-id]");
    let node = actionGroup;
    while (node !== null && parent.contains(node)) {
        const groupId = node.dataset.groupId;
        const instanceId = node.dataset.instanceId;
        if (groupId !== undefined &&
            node.classList.contains("group--compact") &&
            definitions.groups[groupId]?.autoCompact === true) {
            if (action === "toggle-group" && actionGroup === node)
                return null;
            const context = {
                groupId,
                ...(instanceId === undefined ? {} : { instanceId }),
            };
            compactFlowSiblings(module, node);
            const path = groupPathToGroup(module, groupId, instanceId);
            if (path === undefined) {
                module.compactOverrides[phraseKey(groupId, instanceId)] = false;
            }
            else {
                expandGroupPath(module, path);
            }
            return context;
        }
        node = closestParentGroup(node);
    }
    return null;
};
const handleClick = async (module, event) => {
    const target = event.target;
    if (!(target instanceof Element))
        return;
    const parent = document.getElementById(module.parentId);
    if (parent === null || !parent.contains(target))
        return;
    const dismissed = module.openEditor !== null && !targetIsInsideOpenEditor(module, target)
        ? dismissEditor(module)
        : false;
    const button = target.closest("button[data-action]");
    if (button === null || !parent.contains(button)) {
        if (dismissed)
            renderAll();
        return;
    }
    event.preventDefault();
    const action = requireData(button, "action");
    const instanceId = instanceData(button);
    const compactContext = autoCompactContext(module, button, parent);
    if (compactContext !== null) {
        cancelAutoCompact(module, compactContext.groupId, compactContext.instanceId);
    }
    module.status = "";
    let expandedGroup = expandCompactedAutoCompactForAction(module, button, action, parent);
    let compactedGroup = null;
    const activatedByChild = activatingChildActions.has(action)
        ? activateInactiveGroupPath(module, button, parent)
        : null;
    if (activatedByChild !== null)
        expandedGroup ??= activatedByChild;
    if (action === "phrase") {
        const phraseId = requireData(button, "phraseId");
        if (activatedByChild === null ||
            currentPhrase(phraseId, instanceId)?.included !== true) {
            handlePhrase(module, phraseId, instanceId);
        }
    }
    else if (action === "choose-value") {
        selectValue(module, requireData(button, "phraseId"), requireData(button, "valueId"), instanceId);
    }
    else if (action === "choose-freetext") {
        const phraseId = requireData(button, "phraseId");
        const valueId = requireData(button, "valueId");
        const attributeId = requiredAttributes(phraseId, valueId)[0];
        if (attributeId === undefined)
            return;
        const scope = scopeFor(instanceId);
        scope.attributes[phraseId] = {
            ...(scope.attributes[phraseId] ?? {}),
            [attributeId]: requireData(button, "value"),
        };
        selectValue(module, phraseId, valueId, instanceId);
    }
    else if (action === "exclude-phrase") {
        const phraseId = requireData(button, "phraseId");
        setOverride(phraseId, currentPhrase(phraseId, instanceId)?.valueId ?? null, false, instanceId);
        completePrompt(phraseId, instanceId);
        delete module.pickerQueries[phraseKey(phraseId, instanceId)];
        module.openEditor = null;
    }
    else if (action === "reset-phrase") {
        const phraseId = requireData(button, "phraseId");
        const scope = scopeFor(instanceId);
        delete scope.phraseOverrides[phraseId];
        delete scope.attributes[phraseId];
        delete scope.acceptedProvenance[phraseId];
        resetPrompt(phraseId, instanceId);
        delete module.pickerQueries[phraseKey(phraseId, instanceId)];
        module.openEditor = null;
    }
    else if (action === "attribute") {
        const phraseId = requireData(button, "phraseId");
        openAttribute(module, phraseId, requireData(button, "attributeId"), instanceId);
    }
    else if (action === "choose-attribute") {
        const phraseId = requireData(button, "phraseId");
        updateAttribute(phraseId, requireData(button, "attributeId"), requireData(button, "value"), instanceId);
        advanceRequiredAttribute(module, phraseId, instanceId);
    }
    else if (action === "step-number") {
        const phraseId = requireData(button, "phraseId");
        const attributeId = requireData(button, "attributeId");
        const editor = getEditor(phraseId, attributeId);
        if (editor?.type === "number") {
            const current = scopeFor(instanceId).attributes[phraseId]?.[attributeId];
            const base = typeof current === "number" ? current : (editor.default ?? 0);
            updateAttribute(phraseId, attributeId, clampNumber(base + Number(requireData(button, "delta")), editor.min, editor.max), instanceId);
        }
    }
    else if (action === "step-duration") {
        const phraseId = requireData(button, "phraseId");
        const attributeId = requireData(button, "attributeId");
        const editor = getEditor(phraseId, attributeId);
        if (editor?.type === "duration") {
            const value = currentDuration(phraseId, attributeId, editor, instanceId);
            updateAttribute(phraseId, attributeId, {
                ...value,
                amount: Math.max(1, value.amount + Number(requireData(button, "delta"))),
            }, instanceId);
        }
    }
    else if (action === "choose-duration-unit") {
        const phraseId = requireData(button, "phraseId");
        const attributeId = requireData(button, "attributeId");
        const editor = getEditor(phraseId, attributeId);
        if (editor?.type === "duration") {
            const value = currentDuration(phraseId, attributeId, editor, instanceId);
            updateAttribute(phraseId, attributeId, { ...value, unit: requireData(button, "unit") }, instanceId);
        }
    }
    else if (action === "clear-attribute") {
        const phraseId = requireData(button, "phraseId");
        const attributeId = requireData(button, "attributeId");
        const required = requiredAttributes(phraseId, selectedValueId(phraseId, instanceId)).includes(attributeId);
        clearAttribute(phraseId, attributeId, instanceId, required);
        if (required)
            module.openEditor = null;
        else
            advanceRequiredAttribute(module, phraseId, instanceId);
    }
    else if (action === "toggle-set") {
        const setId = requireData(button, "setId");
        const scope = scopeFor(instanceId);
        scope.activeSets = scope.activeSets.includes(setId)
            ? scope.activeSets.filter((id) => id !== setId)
            : [...scope.activeSets, setId];
    }
    else if (action === "open-score") {
        const groupId = requireData(button, "groupId");
        const score = definitions.groups[groupId]?.score;
        if (score !== undefined) {
            const groupEnabled = isGroupEnabled(groupId, definitions, state, instanceId, getSymptomLens());
            const selected = Object.fromEntries(score.criteria.flatMap((criterion) => {
                const phrase = currentPhrase(criterion.phraseId, instanceId);
                return groupEnabled &&
                    phrase?.effectiveIncluded === true &&
                    phrase.valueId !== null
                    ? [[criterion.phraseId, phrase.valueId]]
                    : [];
            }));
            parent.dispatchEvent(new CustomEvent("papiertiger:open-tool", {
                bubbles: true,
                detail: {
                    plugin: "score",
                    id: score.id,
                    label: score.label,
                    params: {
                        id: score.id,
                        score,
                        groupId,
                        ...(instanceId === undefined
                            ? {}
                            : { instanceId }),
                        selected,
                    },
                },
            }));
        }
    }
    else if (action === "toggle-group") {
        const groupId = requireData(button, "groupId");
        const scope = scopeFor(instanceId);
        const enabled = isGroupEnabled(groupId, definitions, state, instanceId, getSymptomLens());
        scope.groupOverrides[groupId] = !enabled;
        const context = {
            groupId,
            ...(instanceId === undefined ? {} : { instanceId }),
        };
        if (enabled) {
            cancelAutoCompact(module, groupId, instanceId);
            module.compactOverrides[phraseKey(groupId, instanceId)] = true;
            compactedGroup = context;
        }
        else {
            const path = groupPathToGroup(module, groupId, instanceId);
            const groupNode = button.closest(".group[data-group-id]");
            if (groupNode !== null)
                compactFlowSiblings(module, groupNode);
            if (path !== undefined)
                expandGroupPath(module, path);
            expandedGroup = context;
        }
        module.openEditor = null;
    }
    else if (action === "toggle-compact") {
        const groupId = requireData(button, "groupId");
        const key = phraseKey(groupId, instanceId);
        const compact = module.compactOverrides[key] ??
            groupStartsCompact(module, groupId, instanceId);
        const groupNode = button.closest(".group[data-group-id]");
        if (compact && groupNode !== null) {
            compactFlowSiblings(module, groupNode);
            expandedGroup = {
                groupId,
                ...(instanceId === undefined ? {} : { instanceId }),
            };
        }
        else if (!compact) {
            compactedGroup = {
                groupId,
                ...(instanceId === undefined ? {} : { instanceId }),
            };
        }
        module.compactOverrides[key] = !compact;
        module.openEditor = null;
    }
    else if (action === "open-group-path") {
        const path = parseCompactGroupPath(requireData(button, "groupPath"));
        const groupNode = button.closest(".group[data-group-id]");
        if (groupNode !== null)
            compactFlowSiblings(module, groupNode);
        expandGroupPath(module, path);
        expandedGroup = path[path.length - 1] ?? null;
        module.openEditor = null;
    }
    else if (action === "reset-group") {
        const groupId = requireData(button, "groupId");
        clearAutoCompactTimers(module);
        if (instanceId === undefined)
            resetStaticGroup(groupId);
        else
            resetInstance(instanceId);
        module.openEditor = null;
    }
    else if (action === "add-group-instance") {
        const groupId = requireData(button, "groupId");
        const addedId = addGroupInstance(groupId);
        const initialPath = allGroupPaths(module.rootId).find((path) => {
            const context = path[path.length - 1];
            return context?.groupId === groupId && context.instanceId === addedId;
        });
        if (definitions.groups[groupId].reveal === "initial" &&
            initialPath !== undefined) {
            holdOpen(module, initialHoldKey(phraseKey(groupId, addedId)), initialPath);
        }
        else {
            module.compactOverrides[phraseKey(groupId, addedId)] = false;
        }
        expandedGroup = { groupId, instanceId: addedId };
        if (!openFirstRequiredInGroup(module, groupId, addedId)) {
            module.openEditor = null;
        }
    }
    else if (action === "remove-group-instance") {
        const groupId = requireData(button, "groupId");
        const removedId = requireData(button, "instanceId");
        state.groupInstances[groupId] = (state.groupInstances[groupId] ?? []).filter((id) => id !== removedId);
        clearAutoCompactTimers(module, removedId);
        delete state.instanceStates[removedId];
        module.openEditor = null;
    }
    else if (action === "close-editor") {
        closeEditor(module);
    }
    else if (action === "copy-text" || action === "copy-data") {
        const rootId = requireData(button, "rootId");
        resolved = resolveDocument(definitions, state, getSymptomLens());
        const document = structuredDocument(rootId, definitions, state, resolved);
        try {
            await copyToClipboard(action === "copy-text"
                ? document.text
                : JSON.stringify(document, null, 2));
            module.status = action === "copy-text" ? "Text kopiert" : "Daten kopiert";
        }
        catch (error) {
            console.error(error);
            module.status = "Kopieren nicht möglich";
        }
    }
    const editorExpansion = expandOpenEditorPath(module);
    if (editorExpansion !== null) {
        const groupNode = button.closest(".group[data-group-id]");
        if (groupNode !== null)
            compactFlowSiblings(module, groupNode);
        expandedGroup ??= editorExpansion;
    }
    renderAll();
    if (openNextPrompt(module)) {
        expandOpenEditorPath(module);
        renderAll();
    }
    if (action !== "open-score") {
        const timerContext = expandedGroup !== null &&
            definitions.groups[expandedGroup.groupId]?.autoCompact === true
            ? expandedGroup
            : compactContext;
        if (timerContext !== null) {
            scheduleAutoCompact(module, timerContext.groupId, timerContext.instanceId);
        }
    }
    focusOpenEditor(module);
    if (expandedGroup !== null) {
        animateGroupTransition(module, expandedGroup.groupId, expandedGroup.instanceId, "expanding");
    }
    if (compactedGroup !== null) {
        animateGroupTransition(module, compactedGroup.groupId, compactedGroup.instanceId, "compacting");
    }
};
const updateFromInput = (field) => {
    if (!(field instanceof HTMLInputElement) || field.dataset.input !== "attribute") {
        return false;
    }
    const phraseId = field.dataset.phraseId;
    const attributeId = field.dataset.attributeId;
    const instanceId = field.dataset.instanceId;
    if (phraseId === undefined || attributeId === undefined)
        return false;
    const editor = getEditor(phraseId, attributeId);
    if (editor === undefined)
        return false;
    if (field.value.trim() === "") {
        delete scopeFor(instanceId).attributes[phraseId]?.[attributeId];
        return true;
    }
    if (editor.type === "number") {
        const parsed = Number(field.value);
        if (Number.isNaN(parsed))
            return false;
        updateAttribute(phraseId, attributeId, clampNumber(parsed, editor.min, editor.max), instanceId);
    }
    else if (editor.type === "duration") {
        const parsed = Number(field.value);
        if (Number.isNaN(parsed))
            return false;
        const value = currentDuration(phraseId, attributeId, editor, instanceId);
        updateAttribute(phraseId, attributeId, {
            ...value,
            amount: Math.max(1, parsed),
            unit: field.dataset.durationUnit ?? value.unit,
        }, instanceId);
    }
    else if (editor.type === "datetime") {
        updateAttribute(phraseId, attributeId, dateTimeValue(field.value), instanceId);
    }
    else {
        updateAttribute(phraseId, attributeId, field.value, instanceId);
    }
    return true;
};
const handleInput = (module, event) => {
    releaseRevealHoldsForTarget(module, event.target);
    cancelAutoCompactForTarget(module, event.target);
    const target = event.target;
    if (target instanceof HTMLInputElement &&
        target.dataset.input === "catalog-search") {
        const phraseId = target.dataset.phraseId;
        const instanceId = target.dataset.instanceId;
        if (phraseId === undefined)
            return;
        const key = phraseKey(phraseId, instanceId);
        module.pickerQueries[key] = target.value;
        const phrase = currentPhrase(phraseId, instanceId);
        const previous = target.closest(".phrase-editor");
        if (phrase === undefined || previous === null)
            return;
        previous.replaceWith(renderPhraseEditor(phraseId, instanceId, definitions, phrase, target.value));
        const parent = document.getElementById(module.parentId);
        const next = [...(parent?.querySelectorAll('input[data-input="catalog-search"]') ?? [])].find((input) => input.dataset.phraseId === phraseId &&
            input.dataset.instanceId === instanceId);
        next?.focus();
        next?.setSelectionRange(next.value.length, next.value.length);
        return;
    }
    if (updateFromInput(event.target))
        module.status = "";
};
const handleChange = (module, event) => {
    releaseRevealHoldsForTarget(module, event.target);
    cancelAutoCompactForTarget(module, event.target);
    if (!updateFromInput(event.target))
        return;
    module.status = "";
    renderAll();
};
const handleKeydown = (module, event) => {
    const target = event.target;
    releaseRevealHoldsForTarget(module, target);
    cancelAutoCompactForTarget(module, target);
    if (event.key !== "Enter" ||
        event.isComposing ||
        !(target instanceof HTMLInputElement) ||
        target.dataset.input !== "attribute") {
        return;
    }
    if (!updateFromInput(target))
        return;
    const finish = target
        .closest(".inline-editor")
        ?.querySelector('button[data-action="close-editor"]');
    if (finish === undefined || finish === null)
        return;
    event.preventDefault();
    finish.click();
};
export const display = async (parentId, params) => {
    const rootId = params.id;
    if (typeof rootId !== "string" || rootId === "") {
        throw new Error("The textblock module needs a group id");
    }
    const parent = document.getElementById(parentId);
    if (parent === null)
        throw new Error(`Parent element "${parentId}" was not found`);
    await ensureGroup(rootId);
    initialiseRepeatables(rootId);
    const module = {
        parentId,
        rootId,
        openEditor: null,
        compactOverrides: {},
        status: "",
        controls: params.controls !== false,
        suggestionKeys: new Set(),
        suggestionHighlights: new Map(),
        revealHolds: new Map(),
        revealGroups: new Map(),
        revealConditionStates: new Map(),
        suggestionsReady: false,
        autoCompactTimers: new Map(),
        autoCompactDelay: configuredAutoCompactDelay(),
        pickerQueries: {},
    };
    const previous = modules.get(parentId);
    if (previous !== undefined)
        clearAutoCompactTimers(previous);
    holdInitialReveals(module);
    modules.set(parentId, module);
    parent.addEventListener("click", (event) => void handleClick(module, event));
    parent.addEventListener("input", (event) => handleInput(module, event));
    parent.addEventListener("change", (event) => handleChange(module, event));
    parent.addEventListener("keydown", (event) => handleKeydown(module, event));
    parent.addEventListener("pointerdown", (event) => {
        releaseRevealHoldsForTarget(module, event.target);
        cancelAutoCompactForTarget(module, event.target);
    });
    parent.addEventListener("pointerup", (event) => restartAutoCompactForTarget(module, event.target));
    parent.addEventListener("pointercancel", (event) => restartAutoCompactForTarget(module, event.target));
    parent.addEventListener("focusin", (event) => {
        selectInitialInputValue(event.target);
        cancelAutoCompactForTarget(module, event.target);
    });
    parent.addEventListener("focusout", (event) => restartAutoCompactForTarget(module, event.target));
    renderAll();
    if (openNextPrompt(module))
        renderAll();
    focusOpenEditor(module);
};
export const getValue = async (id) => {
    await ensureGroup(id);
    initialiseRepeatables(id);
    resolved = resolveDocument(definitions, state, getSymptomLens());
    return renderGroupText(id, definitions, state, resolved);
};
export const getStructuredValue = async (id) => {
    await ensureGroup(id);
    initialiseRepeatables(id);
    resolved = resolveDocument(definitions, state, getSymptomLens());
    return structuredDocument(id, definitions, state, resolved);
};
export const receive = (message) => {
    if (message.type !== "score-result" || !isRecord(message.payload))
        return;
    const payload = message.payload;
    const groupId = payload.groupId;
    const instanceId = payload.instanceId;
    if (typeof groupId !== "string" ||
        (instanceId !== undefined && typeof instanceId !== "string") ||
        !Array.isArray(payload.selections)) {
        throw new Error("Ungültiges Rechnerergebnis.");
    }
    const group = definitions.groups[groupId];
    const score = group?.score;
    if (score === undefined) {
        throw new Error(`Unbekannte Score-Definition "${groupId}".`);
    }
    if ((group.repeatable === undefined && instanceId !== undefined) ||
        (group.repeatable !== undefined &&
            (instanceId === undefined ||
                !(state.groupInstances[groupId] ?? []).includes(instanceId)))) {
        throw new Error("Das Rechnerergebnis gehört nicht zu dieser Instanz.");
    }
    const selections = payload.selections.filter((candidate) => isRecord(candidate) &&
        typeof candidate.phraseId === "string" &&
        typeof candidate.valueId === "string");
    if (selections.length !== score.criteria.length) {
        throw new Error("Das Rechnerergebnis ist unvollständig.");
    }
    const verified = score.criteria.map((criterion) => {
        const selection = selections.find((candidate) => candidate.phraseId === criterion.phraseId);
        const option = criterion.options.find((candidate) => candidate.valueId === selection?.valueId);
        if (selection === undefined || option === undefined) {
            throw new Error("Das Rechnerergebnis passt nicht zur Definition.");
        }
        return { criterion, option };
    });
    const total = verified.reduce((sum, entry) => sum + entry.option.points, 0);
    if (total < score.minimum || total > score.maximum) {
        throw new Error("Das Rechnerergebnis liegt außerhalb des gültigen Bereichs.");
    }
    const scope = scopeFor(instanceId);
    const provenance = [groupId, ...verified.map((entry) => entry.option.valueId)];
    scope.groupOverrides[groupId] = true;
    for (const { criterion, option } of verified) {
        setOverride(criterion.phraseId, option.valueId, true, instanceId, [groupId, option.valueId]);
    }
    scope.attributes[score.target.phraseId] = {
        ...(scope.attributes[score.target.phraseId] ?? {}),
        [score.target.attributeId]: total,
    };
    setOverride(score.target.phraseId, score.target.valueId, true, instanceId, provenance);
    renderAll();
};
export const dispose = (parentId) => {
    const module = modules.get(parentId);
    if (module !== undefined)
        clearAutoCompactTimers(module);
    modules.delete(parentId);
};
document.addEventListener("papiertiger:symptom-lens-change", renderAll);
document.addEventListener("click", (event) => {
    const path = event.composedPath();
    let dismissed = false;
    for (const module of modules.values()) {
        if (module.openEditor === null)
            continue;
        const parent = document.getElementById(module.parentId);
        if (parent !== null && path.includes(parent))
            continue;
        dismissed = dismissEditor(module) || dismissed;
    }
    if (dismissed)
        renderAll();
});
