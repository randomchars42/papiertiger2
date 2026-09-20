import * as baselib from "@lib/base.js";
import { getConfig } from "@lib/config.js";
import { createIndex, relatedTags, searchCatalog, validateCatalog, } from "./cedislib.js";
import { renderModule, renderSearch } from "./cedisui.js";
const modules = new Map();
const states = new Map();
let dataRequest = null;
const requestData = () => {
    if (dataRequest !== null)
        return dataRequest;
    dataRequest = (async () => {
        const value = await baselib.load(`${getConfig("dataURL").replace(/\/$/, "")}/cedis.json`, "json");
        const catalog = validateCatalog(value);
        return { catalog, index: createIndex(catalog) };
    })();
    return dataRequest;
};
const stateFor = (id) => {
    let state = states.get(id);
    if (state !== undefined)
        return state;
    state = { query: "", selectedCode: null };
    states.set(id, state);
    return state;
};
const selectedEntry = (catalog, state) => catalog.entries.find((entry) => entry.code === state.selectedCode) ?? null;
const structuredSelection = (catalog, entry) => {
    if (entry === null)
        return null;
    return {
        system: catalog.system,
        version: catalog.version,
        code: entry.code,
        display: entry.label,
        category: entry.category,
    };
};
const updateSearch = async (module) => {
    const parent = document.getElementById(module.parentId);
    if (parent === null)
        return;
    const data = await requestData();
    const state = stateFor(module.rootId);
    const results = searchCatalog(data.index, state.query);
    renderSearch(parent, data.catalog, results, relatedTags(data.index, results, state.query), state.query, state.selectedCode);
};
const setQuery = async (module, query) => {
    const state = stateFor(module.rootId);
    state.query = query;
    const parent = document.getElementById(module.parentId);
    const input = parent?.querySelector('[data-input="cedis-search"]');
    if (input !== null && input !== undefined)
        input.value = query;
    await updateSearch(module);
    input?.focus();
};
const notifyChange = async (module) => {
    const parent = document.getElementById(module.parentId);
    if (parent === null)
        return;
    const { catalog } = await requestData();
    const entry = selectedEntry(catalog, stateFor(module.rootId));
    parent.dispatchEvent(new CustomEvent("cedis:change", {
        bubbles: true,
        detail: structuredSelection(catalog, entry),
    }));
};
const handleClick = async (module, event) => {
    const target = event.target;
    if (!(target instanceof Element))
        return;
    const button = target.closest("button[data-action]");
    const parent = document.getElementById(module.parentId);
    if (button === null || parent === null || !parent.contains(button))
        return;
    const state = stateFor(module.rootId);
    const action = button.dataset.action;
    if (action === "search-tag") {
        await setQuery(module, button.dataset.query ?? "");
    }
    else if (action === "clear-search") {
        await setQuery(module, "");
    }
    else if (action === "select-code") {
        const { catalog } = await requestData();
        const code = button.dataset.code ?? "";
        if (!catalog.entries.some((entry) => entry.code === code)) {
            return;
        }
        state.selectedCode = code;
        await updateSearch(module);
        await notifyChange(module);
    }
    else if (action === "clear-selection") {
        state.selectedCode = null;
        await updateSearch(module);
        await notifyChange(module);
    }
};
const handleInput = (module, event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) ||
        target.dataset.input !== "cedis-search") {
        return;
    }
    stateFor(module.rootId).query = target.value;
    void updateSearch(module);
};
const handleKeydown = (module, event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) ||
        target.dataset.input !== "cedis-search") {
        return;
    }
    if (event.key === "ArrowDown") {
        const parent = document.getElementById(module.parentId);
        const first = parent?.querySelector('.cedis-result button[data-action="select-code"]');
        if (first !== null && first !== undefined) {
            event.preventDefault();
            first.focus();
        }
    }
    else if (event.key === "Escape" && target.value !== "") {
        event.preventDefault();
        void setQuery(module, "");
    }
};
const attachEvents = (parent, module) => {
    parent.addEventListener("click", (event) => {
        void handleClick(module, event);
    });
    parent.addEventListener("input", (event) => {
        handleInput(module, event);
    });
    parent.addEventListener("keydown", (event) => {
        handleKeydown(module, event);
    });
};
export const init = async () => {
    await requestData();
};
export const display = async (parentID, params) => {
    const parent = document.getElementById(parentID);
    if (parent === null)
        throw new Error(`Parent "${parentID}" was not found`);
    const rootId = typeof params.id === "string" ? params.id : "cedis";
    let module = modules.get(parentID);
    if (module === undefined) {
        module = { parentId: parentID, rootId };
        modules.set(parentID, module);
        attachEvents(parent, module);
    }
    else {
        module.rootId = rootId;
    }
    const data = await requestData();
    const state = stateFor(rootId);
    const results = searchCatalog(data.index, state.query);
    renderModule(parent, rootId, data.catalog, results, relatedTags(data.index, results, state.query), state.query, state.selectedCode);
};
export const getSelection = async (id) => {
    const { catalog } = await requestData();
    return selectedEntry(catalog, stateFor(id));
};
export const getValue = async (id) => {
    const selected = await getSelection(id);
    return selected === null ? "" : `${selected.code}|${selected.label}`;
};
export const getStructuredValue = async (id) => {
    const { catalog } = await requestData();
    return structuredSelection(catalog, selectedEntry(catalog, stateFor(id)));
};
export const dispose = (parentId) => {
    modules.delete(parentId);
};
