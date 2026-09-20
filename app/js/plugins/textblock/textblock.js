import * as baselib from "@lib/base.js";
import { getConfig } from "@lib/config.js";
import { clampNumber, editorDefaultValue, emptyDefinitions, hasAttributeValue, isDurationValue, } from "./textblocklib.js";
import { createDocumentState, isGroupEnabled, isPackage, mergePackage, renderGroupText, resolveDocument, structuredDocument, validateDefinitions, } from "./textblockstate.js";
import { renderModule } from "./textblockui.js";
const definitions = emptyDefinitions();
const state = createDocumentState();
const modules = new Map();
const loadedPackages = new Set();
const packageRequests = new Map();
let resolved = { phrases: {} };
const requestPackage = (id) => {
    let request = packageRequests.get(id);
    if (request !== undefined)
        return request;
    request = (async () => {
        const data = await baselib.load(`${getConfig("dataURL").replace(/\/$/, "")}/${id}.json`, "json");
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
    if (!(id in definitions.groups)) {
        await fetchPackage(id);
    }
    const group = definitions.groups[id];
    if (group === undefined) {
        throw new Error(`Group "${id}" was not found`);
    }
    if (trail.has(id)) {
        throw new Error(`Group cycle detected at "${id}"`);
    }
    const nextTrail = new Set(trail).add(id);
    for (const child of group.children ?? []) {
        await ensureGroup(child, nextTrail);
    }
    for (const setId of group.sets ?? []) {
        if (!(setId in definitions.sets)) {
            await fetchPackage(setId);
        }
    }
    for (const phraseId of group.phrases ?? []) {
        if (!(phraseId in definitions.phrases)) {
            await fetchPackage(phraseId);
        }
        const phrase = definitions.phrases[phraseId];
        if (phrase === undefined) {
            throw new Error(`Phrase "${phraseId}" was not found`);
        }
        for (const editorId of Object.values(phrase.attributes ?? {})) {
            if (!(editorId in definitions.editors)) {
                await fetchPackage(editorId);
            }
        }
    }
};
const renderAll = () => {
    resolved = resolveDocument(definitions, state);
    for (const module of modules.values()) {
        const parent = document.getElementById(module.parentId);
        if (parent !== null) {
            renderModule(parent, module.rootId, definitions, state, resolved, module.openEditor, module.status);
        }
    }
};
const setOverride = (phraseId, valueId, included) => {
    state.phraseOverrides[phraseId] = { valueId, included };
};
const activatePhrase = (phraseId) => {
    const phrase = resolved.phrases[phraseId];
    const values = Object.keys(definitions.phrases[phraseId].values);
    setOverride(phraseId, phrase.valueId ?? values[0] ?? null, true);
};
const handlePhrase = (module, phraseId) => {
    const phrase = resolved.phrases[phraseId];
    const definition = definitions.phrases[phraseId];
    const values = Object.keys(definition.values);
    const firstAttribute = Object.keys(definition.attributes ?? {})[0];
    if (!phrase.included && phrase.valueId !== null) {
        if (firstAttribute !== undefined &&
            phrase.attributes[firstAttribute] === undefined) {
            openAttribute(module, phraseId, firstAttribute);
            return;
        }
        setOverride(phraseId, phrase.valueId, true);
        module.openEditor = null;
        return;
    }
    if (values.length <= 1) {
        setOverride(phraseId, phrase.valueId ?? values[0] ?? null, !phrase.included);
        if (!phrase.included && firstAttribute !== undefined) {
            openAttribute(module, phraseId, firstAttribute);
        }
        else {
            module.openEditor = null;
        }
        return;
    }
    if (values.length === 2) {
        const current = Math.max(0, values.indexOf(phrase.valueId ?? values[0]));
        setOverride(phraseId, values[(current + 1) % values.length], true);
        module.openEditor = null;
        return;
    }
    module.openEditor = { type: "phrase", phraseId };
};
const updateAttribute = (phraseId, attributeId, value) => {
    state.attributes[phraseId] ??= {};
    state.attributes[phraseId][attributeId] = value;
    activatePhrase(phraseId);
};
const openAttribute = (module, phraseId, attributeId) => {
    const editorId = definitions.phrases[phraseId].attributes?.[attributeId];
    const editor = definitions.editors[editorId ?? ""];
    if (editor === undefined)
        return;
    if (state.attributes[phraseId]?.[attributeId] === undefined) {
        const initial = editorDefaultValue(editor);
        if (initial !== undefined) {
            updateAttribute(phraseId, attributeId, initial);
        }
        else {
            activatePhrase(phraseId);
        }
    }
    else {
        activatePhrase(phraseId);
    }
    module.openEditor = { type: "attribute", phraseId, attributeId };
};
const defaultDuration = (editor) => ({
    amount: 1,
    unit: editor.defaultUnit ?? editor.units?.[0] ?? "day",
    anchor: new Date().toISOString(),
});
const currentDuration = (phraseId, attributeId, editor) => {
    const value = state.attributes[phraseId]?.[attributeId];
    return isDurationValue(value) ? value : defaultDuration(editor);
};
const getEditor = (phraseId, attributeId) => {
    const editorId = definitions.phrases[phraseId]?.attributes?.[attributeId];
    return definitions.editors[editorId ?? ""];
};
const clearAttribute = (phraseId, attributeId) => {
    delete state.attributes[phraseId]?.[attributeId];
    if (Object.keys(state.attributes[phraseId] ?? {}).length === 0) {
        delete state.attributes[phraseId];
    }
    delete state.phraseOverrides[phraseId];
};
const closeEditor = (module) => {
    const editor = module.openEditor;
    if (editor?.type === "attribute") {
        const value = state.attributes[editor.phraseId]?.[editor.attributeId];
        if (!hasAttributeValue(value)) {
            clearAttribute(editor.phraseId, editor.attributeId);
        }
    }
    module.openEditor = null;
};
const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const focusOpenAttribute = (module) => {
    const editor = module.openEditor;
    if (isTouchDevice() || editor?.type !== "attribute")
        return;
    const parent = document.getElementById(module.parentId);
    const input = [...(parent?.querySelectorAll('input[data-input="attribute"]') ?? [])].find((field) => field.dataset.phraseId === editor.phraseId &&
        field.dataset.attributeId === editor.attributeId);
    input?.focus();
};
const collectGroupContents = (groupId, phraseIds, setIds, groupIds) => {
    if (groupIds.has(groupId))
        return;
    groupIds.add(groupId);
    const group = definitions.groups[groupId];
    for (const phraseId of group.phrases ?? [])
        phraseIds.add(phraseId);
    for (const setId of group.sets ?? [])
        setIds.add(setId);
    for (const child of group.children ?? []) {
        collectGroupContents(child, phraseIds, setIds, groupIds);
    }
};
const resetGroup = (groupId) => {
    const phraseIds = new Set();
    const setIds = new Set();
    const groupIds = new Set();
    collectGroupContents(groupId, phraseIds, setIds, groupIds);
    for (const phraseId of phraseIds) {
        delete state.phraseOverrides[phraseId];
        delete state.attributes[phraseId];
    }
    for (const id of groupIds)
        delete state.groupOverrides[id];
    state.activeSets = state.activeSets.filter((id) => !setIds.has(id));
};
const copyToClipboard = async (text) => {
    if (navigator.clipboard !== undefined && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.className = "clipboard-fallback";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied)
        throw new Error("Clipboard access failed");
};
const requireData = (button, key) => {
    const value = button.dataset[key];
    if (value === undefined)
        throw new Error(`Missing action data "${key}"`);
    return value;
};
const handleClick = async (module, event) => {
    const target = event.target;
    if (!(target instanceof Element))
        return;
    const button = target.closest("button[data-action]");
    if (button === null)
        return;
    event.preventDefault();
    const action = requireData(button, "action");
    module.status = "";
    if (action === "phrase") {
        handlePhrase(module, requireData(button, "phraseId"));
    }
    else if (action === "choose-value") {
        setOverride(requireData(button, "phraseId"), requireData(button, "valueId"), true);
        module.openEditor = null;
    }
    else if (action === "exclude-phrase") {
        const phraseId = requireData(button, "phraseId");
        setOverride(phraseId, resolved.phrases[phraseId].valueId, false);
        module.openEditor = null;
    }
    else if (action === "reset-phrase") {
        const phraseId = requireData(button, "phraseId");
        delete state.phraseOverrides[phraseId];
        delete state.attributes[phraseId];
        module.openEditor = null;
    }
    else if (action === "attribute") {
        openAttribute(module, requireData(button, "phraseId"), requireData(button, "attributeId"));
    }
    else if (action === "choose-attribute") {
        updateAttribute(requireData(button, "phraseId"), requireData(button, "attributeId"), requireData(button, "value"));
    }
    else if (action === "step-number") {
        const phraseId = requireData(button, "phraseId");
        const attributeId = requireData(button, "attributeId");
        const editor = getEditor(phraseId, attributeId);
        if (editor?.type === "number") {
            const current = state.attributes[phraseId]?.[attributeId];
            const base = typeof current === "number" ? current : (editor.default ?? 0);
            updateAttribute(phraseId, attributeId, clampNumber(base + Number(requireData(button, "delta")), editor.min, editor.max));
        }
    }
    else if (action === "step-duration") {
        const phraseId = requireData(button, "phraseId");
        const attributeId = requireData(button, "attributeId");
        const editor = getEditor(phraseId, attributeId);
        if (editor?.type === "duration") {
            const value = currentDuration(phraseId, attributeId, editor);
            updateAttribute(phraseId, attributeId, {
                ...value,
                amount: Math.max(1, value.amount + Number(requireData(button, "delta"))),
            });
        }
    }
    else if (action === "choose-duration-unit") {
        const phraseId = requireData(button, "phraseId");
        const attributeId = requireData(button, "attributeId");
        const editor = getEditor(phraseId, attributeId);
        if (editor?.type === "duration") {
            const value = currentDuration(phraseId, attributeId, editor);
            updateAttribute(phraseId, attributeId, {
                ...value,
                unit: requireData(button, "unit"),
            });
        }
    }
    else if (action === "clear-attribute") {
        const phraseId = requireData(button, "phraseId");
        const attributeId = requireData(button, "attributeId");
        clearAttribute(phraseId, attributeId);
        module.openEditor = null;
    }
    else if (action === "toggle-set") {
        const setId = requireData(button, "setId");
        state.activeSets = state.activeSets.includes(setId)
            ? state.activeSets.filter((id) => id !== setId)
            : [...state.activeSets, setId];
    }
    else if (action === "toggle-group") {
        const groupId = requireData(button, "groupId");
        state.groupOverrides[groupId] = !isGroupEnabled(groupId, definitions, state);
    }
    else if (action === "reset-group") {
        resetGroup(requireData(button, "groupId"));
        module.openEditor = null;
    }
    else if (action === "close-editor") {
        closeEditor(module);
    }
    else if (action === "copy-text" || action === "copy-data") {
        const rootId = requireData(button, "rootId");
        resolved = resolveDocument(definitions, state);
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
    renderAll();
    focusOpenAttribute(module);
};
const updateFromInput = (field) => {
    if (!(field instanceof HTMLInputElement) || field.dataset.input !== "attribute") {
        return false;
    }
    const phraseId = field.dataset.phraseId;
    const attributeId = field.dataset.attributeId;
    if (phraseId === undefined || attributeId === undefined)
        return false;
    const editor = getEditor(phraseId, attributeId);
    if (editor === undefined)
        return false;
    if (field.value.trim() === "") {
        delete state.attributes[phraseId]?.[attributeId];
        return true;
    }
    if (editor.type === "number") {
        const parsed = Number(field.value);
        if (!Number.isNaN(parsed)) {
            updateAttribute(phraseId, attributeId, clampNumber(parsed, editor.min, editor.max));
        }
        else {
            return false;
        }
    }
    else if (editor.type === "duration") {
        const parsed = Number(field.value);
        if (!Number.isNaN(parsed)) {
            const value = currentDuration(phraseId, attributeId, editor);
            updateAttribute(phraseId, attributeId, {
                ...value,
                amount: Math.max(1, parsed),
                unit: field.dataset.durationUnit ?? value.unit,
            });
        }
        else {
            return false;
        }
    }
    else {
        updateAttribute(phraseId, attributeId, field.value);
    }
    return true;
};
const handleInput = (module, event) => {
    if (updateFromInput(event.target)) {
        module.status = "";
    }
};
const handleChange = (module, event) => {
    if (!updateFromInput(event.target))
        return;
    module.status = "";
    renderAll();
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
    validateDefinitions(definitions);
    const module = {
        parentId,
        rootId,
        openEditor: null,
        status: "",
    };
    modules.set(parentId, module);
    parent.addEventListener("click", (event) => void handleClick(module, event));
    parent.addEventListener("input", (event) => handleInput(module, event));
    parent.addEventListener("change", (event) => handleChange(module, event));
    renderAll();
};
export const getValue = async (id) => {
    await ensureGroup(id);
    resolved = resolveDocument(definitions, state);
    return renderGroupText(id, definitions, state, resolved);
};
export const getStructuredValue = async (id) => {
    await ensureGroup(id);
    resolved = resolveDocument(definitions, state);
    return structuredDocument(id, definitions, state, resolved);
};
