import * as baselib from "@lib/base.js";
import { getConfig } from "@lib/config.js";
import {
    attributePlaceholders,
    clampNumber,
    dateTimeValue,
    editorDefaultValue,
    emptyDefinitions,
    hasAttributeValue,
    isDurationValue,
    parseValue,
} from "./textblocklib.js";
import {
    createDocumentState,
    createScopeState,
    groupItems,
    isGroupConditionMet,
    isGroupEnabled,
    isPackage,
    mergePackage,
    phraseKey,
    renderGroupText,
    resolveDocument,
    scopeState,
    structuredDocument,
    validateDefinitions,
} from "./textblockstate.js";
import { renderModule } from "./textblockui.js";
import type { OpenEditor } from "./textblockui.js";
import type { PluginMessage } from "@lib/plugin.js";
import type {
    AttributeValue,
    DocumentState,
    DurationUnit,
    DurationValue,
    EditorDefinition,
    PackageDefinition,
    ResolvedDocument,
    ScopeState,
    StructuredDocument,
} from "./textblocktypes.js";

type Module = {
    parentId: string;
    rootId: string;
    openEditor: OpenEditor;
    collapseOverrides: Record<string, boolean>;
    status: string;
    controls: boolean;
};

type ScoreResultSelection = {
    phraseId: string;
    valueId: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const definitions = emptyDefinitions();
const state: DocumentState = createDocumentState();
const modules = new Map<string, Module>();
const loadedPackages = new Set<string>();
const packageRequests = new Map<string, Promise<PackageDefinition>>();
let resolved: ResolvedDocument = { phrases: {} };
let instanceCounter = 0;

const requestPackage = (id: string): Promise<PackageDefinition> => {
    let request = packageRequests.get(id);
    if (request !== undefined) return request;
    request = (async (): Promise<PackageDefinition> => {
        const data = await baselib.load(
            `${getConfig("dataURL").replace(/\/$/, "")}/${id}.json`,
            "json",
        );
        if (!isPackage(data)) {
            throw new Error(`Data file "${id}.json" is not a version 2 package`);
        }
        return data;
    })();
    packageRequests.set(id, request);
    return request;
};

const fetchPackage = async (
    id: string,
    trail: readonly string[] = [],
): Promise<void> => {
    if (loadedPackages.has(id)) return;
    if (trail.includes(id)) {
        throw new Error(`Package import cycle: ${[...trail, id].join(" -> ")}`);
    }
    const data = await requestPackage(id);
    for (const importedId of data.imports ?? []) {
        await fetchPackage(importedId, [...trail, id]);
    }
    if (loadedPackages.has(id)) return;
    mergePackage(definitions, data);
    loadedPackages.add(id);
};

const ensureGroup = async (
    id: string,
    trail: Set<string> = new Set(),
): Promise<void> => {
    if (!(id in definitions.groups)) await fetchPackage(id);
    const group = definitions.groups[id];
    if (group === undefined) throw new Error(`Group "${id}" was not found`);
    if (trail.has(id)) throw new Error(`Group cycle detected at "${id}"`);

    const nextTrail = new Set(trail).add(id);
    for (const child of group.children ?? []) await ensureGroup(child, nextTrail);
    for (const setId of group.sets ?? []) {
        if (!(setId in definitions.sets)) await fetchPackage(setId);
    }
    for (const phraseId of group.phrases ?? []) {
        if (!(phraseId in definitions.phrases)) await fetchPackage(phraseId);
        const phrase = definitions.phrases[phraseId];
        if (phrase === undefined) {
            throw new Error(`Phrase "${phraseId}" was not found`);
        }
        for (const editorId of Object.values(phrase.attributes ?? {})) {
            if (!(editorId in definitions.editors)) await fetchPackage(editorId);
        }
    }
};

const nextInstanceId = (groupId: string): string => {
    instanceCounter += 1;
    const suffix =
        typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${instanceCounter}`;
    return `${groupId}-${suffix}`;
};

const addGroupInstance = (groupId: string): string => {
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

const initialiseRepeatables = (groupId: string): void => {
    const group = definitions.groups[groupId];
    for (const child of group.children ?? []) {
        const childGroup = definitions.groups[child];
        if (childGroup.repeatable !== undefined) {
            if (state.groupInstances[child] === undefined) {
                state.groupInstances[child] = [];
                for (let index = 0; index < (childGroup.repeatable.initial ?? 0); index += 1) {
                    addGroupInstance(child);
                }
            }
        } else {
            initialiseRepeatables(child);
        }
    }
};

const renderAll = (): void => {
    resolved = resolveDocument(definitions, state);
    for (const module of modules.values()) {
        const parent = document.getElementById(module.parentId);
        if (parent === null) continue;
        renderModule(
            parent,
            module.rootId,
            definitions,
            state,
            resolved,
            module.openEditor,
            module.collapseOverrides,
            module.status,
            module.controls,
        );
    }
};

const scopeFor = (instanceId?: string): ScopeState => scopeState(state, instanceId);

const currentPhrase = (phraseId: string, instanceId?: string) =>
    resolved.phrases[phraseKey(phraseId, instanceId)];

const completePrompt = (phraseId: string, instanceId?: string): void => {
    if (definitions.phrases[phraseId]?.prompt !== true) return;
    const scope = scopeFor(instanceId);
    if (!scope.completedPrompts.includes(phraseId)) {
        scope.completedPrompts.push(phraseId);
    }
};

const resetPrompt = (phraseId: string, instanceId?: string): void => {
    const scope = scopeFor(instanceId);
    scope.completedPrompts = scope.completedPrompts.filter(
        (candidate) => candidate !== phraseId,
    );
};

const nextPromptInGroup = (
    module: Module,
    groupId: string,
    instanceId?: string,
): OpenEditor => {
    if (!isGroupEnabled(groupId, definitions, state, instanceId)) return null;
    if (!isGroupConditionMet(groupId, definitions, resolved, instanceId)) {
        return null;
    }
    const group = definitions.groups[groupId];
    const collapsed =
        module.collapseOverrides[phraseKey(groupId, instanceId)] ??
        group.collapsed ??
        false;
    if (collapsed) return null;

    const scope = scopeFor(instanceId);
    for (const item of groupItems(group)) {
        if (item.type === "phrase") {
            const phrase = currentPhrase(item.id, instanceId);
            if (
                definitions.phrases[item.id].prompt === true &&
                phrase?.visible === true &&
                !scope.completedPrompts.includes(item.id)
            ) {
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
                const prompt = nextPromptInGroup(
                    module,
                    childId,
                    childInstanceId,
                );
                if (prompt !== null) return prompt;
            }
        } else {
            const prompt = nextPromptInGroup(
                module,
                childId,
                instanceId,
            );
            if (prompt !== null) return prompt;
        }
    }
    return null;
};

const openNextPrompt = (module: Module): boolean => {
    if (module.openEditor !== null) return false;
    const prompt = nextPromptInGroup(module, module.rootId);
    if (prompt === null) return false;
    module.openEditor = prompt;
    return true;
};

const setOverride = (
    phraseId: string,
    valueId: string | null,
    included: boolean,
    instanceId?: string,
    provenance?: string[],
): void => {
    const scope = scopeFor(instanceId);
    scope.phraseOverrides[phraseId] = { valueId, included };
    delete scope.externalSuggestions[phraseId];
    if (provenance === undefined) {
        delete scope.acceptedProvenance[phraseId];
    } else {
        scope.acceptedProvenance[phraseId] = [...provenance];
    }
};

const requiredAttributes = (phraseId: string, valueId: string | null): string[] => {
    if (valueId === null) return [];
    const value = definitions.phrases[phraseId].values[valueId];
    if (value === undefined) return [];
    return attributePlaceholders(parseValue(value).text)
        .filter((placeholder) => placeholder.required)
        .map((placeholder) => placeholder.id);
};

const missingAttribute = (
    phraseId: string,
    valueId: string | null,
    instanceId?: string,
): string | undefined => {
    const values = scopeFor(instanceId).attributes[phraseId] ?? {};
    return requiredAttributes(phraseId, valueId).find(
        (attributeId) => !hasAttributeValue(values[attributeId]),
    );
};

const activatePhrase = (phraseId: string, instanceId?: string): void => {
    const scope = scopeFor(instanceId);
    const phrase = currentPhrase(phraseId, instanceId);
    const definition = definitions.phrases[phraseId];
    const values = Object.keys(definition.values);
    const defaultValue =
        definition.default === "" || definition.default === null
            ? undefined
            : definition.default;
    setOverride(
        phraseId,
        scope.phraseOverrides[phraseId]?.valueId ??
            phrase?.valueId ??
            defaultValue ??
            values[0] ??
            null,
        true,
        instanceId,
    );
};

const updateAttribute = (
    phraseId: string,
    attributeId: string,
    value: AttributeValue,
    instanceId?: string,
): void => {
    const scope = scopeFor(instanceId);
    scope.attributes[phraseId] ??= {};
    scope.attributes[phraseId][attributeId] = value;
    activatePhrase(phraseId, instanceId);
};

const openAttribute = (
    module: Module,
    phraseId: string,
    attributeId: string,
    instanceId?: string,
): void => {
    const editorId = definitions.phrases[phraseId].attributes?.[attributeId];
    const editor = definitions.editors[editorId ?? ""];
    if (editor === undefined) return;
    const scope = scopeFor(instanceId);
    if (scope.attributes[phraseId]?.[attributeId] === undefined) {
        const initial = editorDefaultValue(editor);
        if (initial !== undefined) {
            updateAttribute(phraseId, attributeId, initial, instanceId);
        } else {
            activatePhrase(phraseId, instanceId);
        }
    } else {
        activatePhrase(phraseId, instanceId);
    }
    module.openEditor = {
        type: "attribute",
        phraseId,
        attributeId,
        ...(instanceId === undefined ? {} : { instanceId }),
    };
};

const selectValue = (
    module: Module,
    phraseId: string,
    valueId: string,
    instanceId?: string,
): void => {
    const scope = scopeFor(instanceId);
    const suggestion = scope.externalSuggestions[phraseId];
    if (suggestion?.valueId === valueId) {
        scope.attributes[phraseId] = {
            ...(scope.attributes[phraseId] ?? {}),
            ...suggestion.attributes,
        };
    }
    setOverride(
        phraseId,
        valueId,
        true,
        instanceId,
        suggestion?.valueId === valueId ? suggestion.provenance : undefined,
    );
    completePrompt(phraseId, instanceId);
    const missing = missingAttribute(phraseId, valueId, instanceId);
    if (missing !== undefined) {
        openAttribute(module, phraseId, missing, instanceId);
    } else {
        module.openEditor = null;
    }
};

const handlePhrase = (
    module: Module,
    phraseId: string,
    instanceId?: string,
): void => {
    const phrase = currentPhrase(phraseId, instanceId);
    const values = Object.keys(definitions.phrases[phraseId].values);
    if (phrase === undefined) return;

    if (phrase.valueId === null) {
        if (values.length === 1) {
            selectValue(module, phraseId, values[0], instanceId);
        } else {
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
        selectValue(
            module,
            phraseId,
            values[(current + 1) % values.length],
            instanceId,
        );
        return;
    }

    module.openEditor = {
        type: "phrase",
        phraseId,
        ...(instanceId === undefined ? {} : { instanceId }),
    };
};

const defaultDuration = (
    editor: Extract<EditorDefinition, { type: "duration" }>,
): DurationValue => ({
    amount: 1,
    unit: editor.defaultUnit ?? editor.units?.[0] ?? "day",
    anchor: new Date().toISOString(),
});

const currentDuration = (
    phraseId: string,
    attributeId: string,
    editor: Extract<EditorDefinition, { type: "duration" }>,
    instanceId?: string,
): DurationValue => {
    const value = scopeFor(instanceId).attributes[phraseId]?.[attributeId];
    return isDurationValue(value) ? value : defaultDuration(editor);
};

const getEditor = (
    phraseId: string,
    attributeId: string,
): EditorDefinition | undefined => {
    const editorId = definitions.phrases[phraseId]?.attributes?.[attributeId];
    return definitions.editors[editorId ?? ""];
};

const clearAttribute = (
    phraseId: string,
    attributeId: string,
    instanceId?: string,
    deactivateIncompletePhrase = true,
): void => {
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

const selectedValueId = (
    phraseId: string,
    instanceId?: string,
): string | null =>
    scopeFor(instanceId).phraseOverrides[phraseId]?.valueId ??
    currentPhrase(phraseId, instanceId)?.valueId ??
    null;

const advanceRequiredAttribute = (
    module: Module,
    phraseId: string,
    instanceId?: string,
): void => {
    const missing = missingAttribute(
        phraseId,
        selectedValueId(phraseId, instanceId),
        instanceId,
    );
    if (missing === undefined) {
        module.openEditor = null;
    } else {
        openAttribute(module, phraseId, missing, instanceId);
    }
};

const openFirstRequiredInGroup = (
    module: Module,
    groupId: string,
    instanceId: string,
): boolean => {
    const group = definitions.groups[groupId];
    for (const item of groupItems(group)) {
        if (item.type === "phrase") {
            const definition = definitions.phrases[item.id];
            const valueId =
                definition.default === "" || definition.default === null
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
        if (
            definitions.groups[childId].repeatable === undefined &&
            openFirstRequiredInGroup(module, childId, instanceId)
        ) {
            return true;
        }
    }
    return false;
};

const closeEditor = (module: Module): void => {
    const editor = module.openEditor;
    if (editor?.type === "phrase") {
        completePrompt(editor.phraseId, editor.instanceId);
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
        const required = requiredAttributes(
            editor.phraseId,
            selectedValueId(editor.phraseId, editor.instanceId),
        ).includes(editor.attributeId);
        clearAttribute(
            editor.phraseId,
            editor.attributeId,
            editor.instanceId,
            required,
        );
        if (required) {
            module.openEditor = null;
        } else {
            advanceRequiredAttribute(
                module,
                editor.phraseId,
                editor.instanceId,
            );
        }
        return;
    }
    const phrase = currentPhrase(editor.phraseId, editor.instanceId);
    const missing = missingAttribute(
        editor.phraseId,
        phrase?.valueId ?? null,
        editor.instanceId,
    );
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

const isTouchDevice = (): boolean =>
    window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

const focusOpenAttribute = (module: Module): void => {
    const editor = module.openEditor;
    if (isTouchDevice() || editor?.type !== "attribute") return;
    const parent = document.getElementById(module.parentId);
    const input = [...(parent?.querySelectorAll<HTMLInputElement>(
        'input[data-input="attribute"]',
    ) ?? [])].find(
        (field) =>
            field.dataset.phraseId === editor.phraseId &&
            field.dataset.attributeId === editor.attributeId &&
            field.dataset.instanceId === editor.instanceId,
    );
    input?.focus();
};

const resetInstance = (instanceId: string): void => {
    if (state.instanceStates[instanceId] !== undefined) {
        state.instanceStates[instanceId] = createScopeState();
    }
};

const resetStaticGroup = (groupId: string): void => {
    const group = definitions.groups[groupId];
    for (const phraseId of group.phrases ?? []) {
        delete state.phraseOverrides[phraseId];
        delete state.attributes[phraseId];
        delete state.externalSuggestions[phraseId];
        delete state.acceptedProvenance[phraseId];
        resetPrompt(phraseId);
    }
    for (const setId of group.sets ?? []) {
        state.activeSets = state.activeSets.filter((id) => id !== setId);
    }
    delete state.groupOverrides[groupId];
    for (const child of group.children ?? []) {
        const childGroup = definitions.groups[child];
        if (childGroup.repeatable !== undefined) {
            for (const instanceId of state.groupInstances[child] ?? []) {
                delete state.instanceStates[instanceId];
            }
            state.groupInstances[child] = [];
            for (let index = 0; index < (childGroup.repeatable.initial ?? 0); index += 1) {
                addGroupInstance(child);
            }
        } else {
            resetStaticGroup(child);
        }
    }
};

const copyToClipboard = async (text: string): Promise<void> => {
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
    if (!copied) throw new Error("Clipboard access failed");
};

const requireData = (button: HTMLButtonElement, key: string): string => {
    const value = button.dataset[key];
    if (value === undefined) throw new Error(`Missing action data "${key}"`);
    return value;
};

const instanceData = (button: HTMLButtonElement): string | undefined =>
    button.dataset.instanceId;

const handleClick = async (module: Module, event: Event): Promise<void> => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("button[data-action]");
    const parent = document.getElementById(module.parentId);
    if (button === null || parent === null || !parent.contains(button)) return;
    event.preventDefault();

    const action = requireData(button, "action");
    const instanceId = instanceData(button);
    module.status = "";

    if (action === "phrase") {
        handlePhrase(module, requireData(button, "phraseId"), instanceId);
    } else if (action === "choose-value") {
        selectValue(
            module,
            requireData(button, "phraseId"),
            requireData(button, "valueId"),
            instanceId,
        );
    } else if (action === "exclude-phrase") {
        const phraseId = requireData(button, "phraseId");
        setOverride(
            phraseId,
            currentPhrase(phraseId, instanceId)?.valueId ?? null,
            false,
            instanceId,
        );
        completePrompt(phraseId, instanceId);
        module.openEditor = null;
    } else if (action === "reset-phrase") {
        const phraseId = requireData(button, "phraseId");
        const scope = scopeFor(instanceId);
        delete scope.phraseOverrides[phraseId];
        delete scope.attributes[phraseId];
        delete scope.externalSuggestions[phraseId];
        delete scope.acceptedProvenance[phraseId];
        resetPrompt(phraseId, instanceId);
        module.openEditor = null;
    } else if (action === "attribute") {
        const phraseId = requireData(button, "phraseId");
        const scope = scopeFor(instanceId);
        const suggestion = scope.externalSuggestions[phraseId];
        if (suggestion !== undefined) {
            scope.attributes[phraseId] = {
                ...(scope.attributes[phraseId] ?? {}),
                ...suggestion.attributes,
            };
            setOverride(
                phraseId,
                suggestion.valueId,
                true,
                instanceId,
                suggestion.provenance,
            );
        }
        openAttribute(
            module,
            phraseId,
            requireData(button, "attributeId"),
            instanceId,
        );
    } else if (action === "choose-attribute") {
        const phraseId = requireData(button, "phraseId");
        updateAttribute(
            phraseId,
            requireData(button, "attributeId"),
            requireData(button, "value"),
            instanceId,
        );
        advanceRequiredAttribute(module, phraseId, instanceId);
    } else if (action === "step-number") {
        const phraseId = requireData(button, "phraseId");
        const attributeId = requireData(button, "attributeId");
        const editor = getEditor(phraseId, attributeId);
        if (editor?.type === "number") {
            const current = scopeFor(instanceId).attributes[phraseId]?.[attributeId];
            const base = typeof current === "number" ? current : (editor.default ?? 0);
            updateAttribute(
                phraseId,
                attributeId,
                clampNumber(
                    base + Number(requireData(button, "delta")),
                    editor.min,
                    editor.max,
                ),
                instanceId,
            );
        }
    } else if (action === "step-duration") {
        const phraseId = requireData(button, "phraseId");
        const attributeId = requireData(button, "attributeId");
        const editor = getEditor(phraseId, attributeId);
        if (editor?.type === "duration") {
            const value = currentDuration(
                phraseId,
                attributeId,
                editor,
                instanceId,
            );
            updateAttribute(
                phraseId,
                attributeId,
                {
                    ...value,
                    amount: Math.max(
                        1,
                        value.amount + Number(requireData(button, "delta")),
                    ),
                },
                instanceId,
            );
        }
    } else if (action === "choose-duration-unit") {
        const phraseId = requireData(button, "phraseId");
        const attributeId = requireData(button, "attributeId");
        const editor = getEditor(phraseId, attributeId);
        if (editor?.type === "duration") {
            const value = currentDuration(
                phraseId,
                attributeId,
                editor,
                instanceId,
            );
            updateAttribute(
                phraseId,
                attributeId,
                { ...value, unit: requireData(button, "unit") as DurationUnit },
                instanceId,
            );
        }
    } else if (action === "clear-attribute") {
        const phraseId = requireData(button, "phraseId");
        const attributeId = requireData(button, "attributeId");
        const required = requiredAttributes(
            phraseId,
            selectedValueId(phraseId, instanceId),
        ).includes(attributeId);
        clearAttribute(
            phraseId,
            attributeId,
            instanceId,
            required,
        );
        if (required) module.openEditor = null;
        else advanceRequiredAttribute(module, phraseId, instanceId);
    } else if (action === "toggle-set") {
        const setId = requireData(button, "setId");
        const scope = scopeFor(instanceId);
        scope.activeSets = scope.activeSets.includes(setId)
            ? scope.activeSets.filter((id) => id !== setId)
            : [...scope.activeSets, setId];
    } else if (action === "open-score") {
        const groupId = requireData(button, "groupId");
        const score = definitions.groups[groupId]?.score;
        if (score !== undefined) {
            const groupEnabled = isGroupEnabled(
                groupId,
                definitions,
                state,
                instanceId,
            );
            const selected = Object.fromEntries(
                score.criteria.flatMap((criterion) => {
                    const phrase = currentPhrase(
                        criterion.phraseId,
                        instanceId,
                    );
                    return groupEnabled &&
                        phrase?.included === true &&
                        phrase.valueId !== null
                        ? [[criterion.phraseId, phrase.valueId]]
                        : [];
                }),
            );
            parent.dispatchEvent(
                new CustomEvent("papiertiger:open-tool", {
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
                }),
            );
        }
    } else if (action === "toggle-group") {
        const groupId = requireData(button, "groupId");
        const scope = scopeFor(instanceId);
        scope.groupOverrides[groupId] = !isGroupEnabled(
            groupId,
            definitions,
            state,
            instanceId,
        );
        module.openEditor = null;
    } else if (action === "toggle-collapse") {
        const groupId = requireData(button, "groupId");
        const key = phraseKey(groupId, instanceId);
        const collapsed =
            module.collapseOverrides[key] ??
            definitions.groups[groupId].collapsed ??
            false;
        module.collapseOverrides[key] = !collapsed;
        module.openEditor = null;
    } else if (action === "reset-group") {
        const groupId = requireData(button, "groupId");
        if (instanceId === undefined) resetStaticGroup(groupId);
        else resetInstance(instanceId);
        module.openEditor = null;
    } else if (action === "add-group-instance") {
        const groupId = requireData(button, "groupId");
        const addedId = addGroupInstance(groupId);
        if (!openFirstRequiredInGroup(module, groupId, addedId)) {
            module.openEditor = null;
        }
    } else if (action === "remove-group-instance") {
        const groupId = requireData(button, "groupId");
        const removedId = requireData(button, "instanceId");
        state.groupInstances[groupId] = (state.groupInstances[groupId] ?? []).filter(
            (id) => id !== removedId,
        );
        delete state.instanceStates[removedId];
        module.openEditor = null;
    } else if (action === "close-editor") {
        closeEditor(module);
    } else if (action === "copy-text" || action === "copy-data") {
        const rootId = requireData(button, "rootId");
        resolved = resolveDocument(definitions, state);
        const document = structuredDocument(rootId, definitions, state, resolved);
        try {
            await copyToClipboard(
                action === "copy-text"
                    ? document.text
                    : JSON.stringify(document, null, 2),
            );
            module.status = action === "copy-text" ? "Text kopiert" : "Daten kopiert";
        } catch (error) {
            console.error(error);
            module.status = "Kopieren nicht möglich";
        }
    }

    renderAll();
    if (openNextPrompt(module)) renderAll();
    focusOpenAttribute(module);
};

const updateFromInput = (field: EventTarget | null): boolean => {
    if (!(field instanceof HTMLInputElement) || field.dataset.input !== "attribute") {
        return false;
    }
    const phraseId = field.dataset.phraseId;
    const attributeId = field.dataset.attributeId;
    const instanceId = field.dataset.instanceId;
    if (phraseId === undefined || attributeId === undefined) return false;
    const editor = getEditor(phraseId, attributeId);
    if (editor === undefined) return false;

    if (field.value.trim() === "") {
        delete scopeFor(instanceId).attributes[phraseId]?.[attributeId];
        return true;
    }

    if (editor.type === "number") {
        const parsed = Number(field.value);
        if (Number.isNaN(parsed)) return false;
        updateAttribute(
            phraseId,
            attributeId,
            clampNumber(parsed, editor.min, editor.max),
            instanceId,
        );
    } else if (editor.type === "duration") {
        const parsed = Number(field.value);
        if (Number.isNaN(parsed)) return false;
        const value = currentDuration(phraseId, attributeId, editor, instanceId);
        updateAttribute(
            phraseId,
            attributeId,
            {
                ...value,
                amount: Math.max(1, parsed),
                unit: (field.dataset.durationUnit as DurationUnit) ?? value.unit,
            },
            instanceId,
        );
    } else if (editor.type === "datetime") {
        updateAttribute(
            phraseId,
            attributeId,
            dateTimeValue(field.value),
            instanceId,
        );
    } else {
        updateAttribute(phraseId, attributeId, field.value, instanceId);
    }
    return true;
};

const handleInput = (module: Module, event: Event): void => {
    if (updateFromInput(event.target)) module.status = "";
};

const handleChange = (module: Module, event: Event): void => {
    if (!updateFromInput(event.target)) return;
    module.status = "";
    renderAll();
};

export const display = async (
    parentId: string,
    params: Record<string, unknown>,
): Promise<void> => {
    const rootId = params.id;
    if (typeof rootId !== "string" || rootId === "") {
        throw new Error("The textblock module needs a group id");
    }
    const parent = document.getElementById(parentId);
    if (parent === null) throw new Error(`Parent element "${parentId}" was not found`);

    await ensureGroup(rootId);
    validateDefinitions(definitions);
    initialiseRepeatables(rootId);

    const module: Module = {
        parentId,
        rootId,
        openEditor: null,
        collapseOverrides: {},
        status: "",
        controls: params.controls !== false,
    };
    modules.set(parentId, module);
    parent.addEventListener("click", (event) => void handleClick(module, event));
    parent.addEventListener("input", (event) => handleInput(module, event));
    parent.addEventListener("change", (event) => handleChange(module, event));
    renderAll();
    if (openNextPrompt(module)) renderAll();
};

export const getValue = async (id: string): Promise<string> => {
    await ensureGroup(id);
    initialiseRepeatables(id);
    resolved = resolveDocument(definitions, state);
    return renderGroupText(id, definitions, state, resolved);
};

export const getStructuredValue = async (
    id: string,
): Promise<StructuredDocument> => {
    await ensureGroup(id);
    initialiseRepeatables(id);
    resolved = resolveDocument(definitions, state);
    return structuredDocument(id, definitions, state, resolved);
};

export const receive = (message: PluginMessage): void => {
    if (message.type !== "score-result" || !isRecord(message.payload)) return;
    const payload = message.payload;
    const groupId = payload.groupId;
    const instanceId = payload.instanceId;
    if (
        typeof groupId !== "string" ||
        (instanceId !== undefined && typeof instanceId !== "string") ||
        !Array.isArray(payload.selections)
    ) {
        throw new Error("Ungültiges Rechnerergebnis.");
    }
    const group = definitions.groups[groupId];
    const score = group?.score;
    if (score === undefined) {
        throw new Error(`Unbekannte Score-Definition "${groupId}".`);
    }
    if (
        (group.repeatable === undefined && instanceId !== undefined) ||
        (group.repeatable !== undefined &&
            (instanceId === undefined ||
                !(state.groupInstances[groupId] ?? []).includes(instanceId)))
    ) {
        throw new Error("Das Rechnerergebnis gehört nicht zu dieser Instanz.");
    }
    const selections = payload.selections.filter(
        (candidate): candidate is ScoreResultSelection =>
            isRecord(candidate) &&
            typeof candidate.phraseId === "string" &&
            typeof candidate.valueId === "string",
    );
    if (selections.length !== score.criteria.length) {
        throw new Error("Das Rechnerergebnis ist unvollständig.");
    }

    const verified = score.criteria.map((criterion) => {
        const selection = selections.find(
            (candidate) => candidate.phraseId === criterion.phraseId,
        );
        const option = criterion.options.find(
            (candidate) => candidate.valueId === selection?.valueId,
        );
        if (selection === undefined || option === undefined) {
            throw new Error("Das Rechnerergebnis passt nicht zur Definition.");
        }
        return { criterion, option };
    });
    const total = verified.reduce((sum, entry) => sum + entry.option.points, 0);
    if (total < score.minimum || total > score.maximum) {
        throw new Error("Das Rechnerergebnis liegt außerhalb des gültigen Bereichs.");
    }

    const scope = scopeFor(instanceId as string | undefined);
    const provenance = [groupId, ...verified.map((entry) => entry.option.valueId)];
    scope.groupOverrides[groupId] = true;
    for (const { criterion, option } of verified) {
        scope.externalSuggestions[criterion.phraseId] = {
            valueId: option.valueId,
            attributes: {},
            provenance: [groupId, option.valueId],
        };
    }
    scope.externalSuggestions[score.target.phraseId] = {
        valueId: score.target.valueId,
        attributes: { [score.target.attributeId]: total },
        provenance,
    };
    renderAll();
};

export const dispose = (parentId: string): void => {
    modules.delete(parentId);
};
