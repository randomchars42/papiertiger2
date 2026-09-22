import * as baselib from "@lib/base.js";
import { getConfig } from "@lib/config.js";
import { validateCatalog } from "./cedislib.js";
import { renderEditor, renderSummary } from "./cedisui.js";
const modules = new Map();
const states = new Map();
let dataRequest = null;
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const requestData = () => {
    if (dataRequest !== null)
        return dataRequest;
    dataRequest = (async () => validateCatalog(await baselib.load(`${getConfig("dataURL").replace(/\/$/, "")}/cedis.json`, "json")))();
    return dataRequest;
};
const stateFor = (id) => {
    let state = states.get(id);
    if (state !== undefined)
        return state;
    state = { selectedCodes: [], suggestions: [] };
    states.set(id, state);
    return state;
};
const render = async (module) => {
    const parent = document.getElementById(module.parentId);
    if (parent === null)
        return;
    const catalog = await requestData();
    const state = stateFor(module.rootId);
    if (module.mode === "editor")
        renderEditor(parent, module.rootId, catalog, state);
    else
        renderSummary(parent, module.rootId, catalog, state);
};
const renderRoot = async (rootId) => {
    await Promise.all([...modules.values()]
        .filter((module) => module.rootId === rootId)
        .map(render));
};
const notifyStatus = (rootId) => {
    for (const module of modules.values()) {
        if (module.rootId !== rootId)
            continue;
        document.getElementById(module.parentId)?.dispatchEvent(new CustomEvent("papiertiger:tool-status", { bubbles: true }));
        break;
    }
};
const moveCode = (codes, code, offset) => {
    const index = codes.indexOf(code);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= codes.length)
        return codes;
    const next = [...codes];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
};
const handleClick = async (module, event) => {
    const target = event.target;
    if (!(target instanceof Element))
        return;
    const button = target.closest("button[data-action]");
    const parent = document.getElementById(module.parentId);
    if (button === null || parent === null || !parent.contains(button))
        return;
    const action = button.dataset.action;
    const state = stateFor(module.rootId);
    const code = button.dataset.code;
    if (action === "open-editor") {
        parent.dispatchEvent(new CustomEvent("papiertiger:open-tool", {
            bubbles: true,
            detail: {
                plugin: "cedis",
                id: module.rootId,
                label: "CEDIS PCL",
                params: { id: module.rootId, mode: "editor" },
            },
        }));
        return;
    }
    if (code === undefined)
        return;
    if (action === "add-code" && !state.selectedCodes.includes(code)) {
        state.selectedCodes.push(code);
    }
    else if (action === "remove-code") {
        state.selectedCodes = state.selectedCodes.filter((candidate) => candidate !== code);
    }
    else if (action === "move-up") {
        state.selectedCodes = moveCode(state.selectedCodes, code, -1);
    }
    else if (action === "move-down") {
        state.selectedCodes = moveCode(state.selectedCodes, code, 1);
    }
    else {
        return;
    }
    await renderRoot(module.rootId);
    notifyStatus(module.rootId);
};
const attachEvents = (parent, module) => {
    parent.addEventListener("click", (event) => void handleClick(module, event));
};
const selection = (catalog, code) => {
    const entry = catalog.entries.find((candidate) => candidate.code === code);
    if (entry === undefined)
        return null;
    return {
        system: catalog.system,
        version: catalog.version,
        code: entry.code,
        display: entry.label,
        category: entry.category,
    };
};
export const init = async () => {
    await requestData();
};
export const display = async (parentId, params) => {
    const parent = document.getElementById(parentId);
    if (parent === null)
        throw new Error(`Parent "${parentId}" was not found`);
    const rootId = typeof params.id === "string" ? params.id : "cedis";
    const mode = params.mode === "editor" ? "editor" : "summary";
    let module = modules.get(parentId);
    if (module === undefined) {
        module = { parentId, rootId, mode };
        modules.set(parentId, module);
        attachEvents(parent, module);
    }
    else {
        module.rootId = rootId;
        module.mode = mode;
    }
    await render(module);
};
export const getSelection = async (id) => {
    const catalog = await requestData();
    const entries = new Map(catalog.entries.map((entry) => [entry.code, entry]));
    return stateFor(id).selectedCodes.flatMap((code) => {
        const entry = entries.get(code);
        return entry === undefined ? [] : [entry];
    });
};
export const getValue = async (id) => {
    const selected = await getSelection(id);
    return selected.length === 0
        ? ""
        : `CEDIS PCL: ${selected.map((entry) => `${entry.code} ${entry.label}`).join("; ")}`;
};
export const getStructuredValue = async (id) => {
    const catalog = await requestData();
    const selections = stateFor(id).selectedCodes.flatMap((code) => {
        const selected = selection(catalog, code);
        return selected === null ? [] : [selected];
    });
    return selections.length === 0
        ? null
        : { system: catalog.system, version: catalog.version, selections };
};
export const receive = async (message) => {
    if (message.type !== "cedis-suggestions" || !isRecord(message.payload))
        return;
    const rootId = typeof message.payload.id === "string" ? message.payload.id : "cedis";
    if (!Array.isArray(message.payload.suggestions))
        return;
    const catalog = await requestData();
    const knownCodes = new Set(catalog.entries.map((entry) => entry.code));
    const suggestions = message.payload.suggestions.filter((candidate) => isRecord(candidate) &&
        typeof candidate.code === "string" &&
        knownCodes.has(candidate.code) &&
        Array.isArray(candidate.sources) &&
        candidate.sources.every((source) => typeof source === "string") &&
        Array.isArray(candidate.relations) &&
        candidate.relations.every((relation) => typeof relation === "string"));
    stateFor(rootId).suggestions = suggestions;
    await renderRoot(rootId);
    notifyStatus(rootId);
};
export const getToolStatus = async (id) => {
    const state = stateFor(id);
    const pending = state.suggestions.filter((suggestion) => !state.selectedCodes.includes(suggestion.code)).length;
    return {
        ...(state.selectedCodes.length > 0
            ? { badge: String(state.selectedCodes.length) }
            : pending > 0
                ? { badge: String(pending) }
                : {}),
        attention: pending > 0,
    };
};
export const dispose = (parentId) => {
    modules.delete(parentId);
};
