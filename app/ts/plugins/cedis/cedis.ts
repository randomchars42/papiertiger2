import * as baselib from "@lib/base.js";
import { getConfig } from "@lib/config.js";
import type { PluginMessage, ToolStatus } from "@lib/plugin.js";
import { validateCatalog } from "./cedislib.js";
import { renderEditor, renderSummary } from "./cedisui.js";
import type {
    CedisCatalog,
    CedisEntry,
    CedisSelection,
    CedisState,
    CedisStructuredValue,
    CedisSuggestion,
} from "./cedistypes.js";

type Module = {
    parentId: string;
    rootId: string;
    mode: "summary" | "editor";
};

const modules = new Map<string, Module>();
const states = new Map<string, CedisState>();
let dataRequest: Promise<CedisCatalog> | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const requestData = (): Promise<CedisCatalog> => {
    if (dataRequest !== null) return dataRequest;
    dataRequest = (async (): Promise<CedisCatalog> =>
        validateCatalog(
            await baselib.load(
                `${getConfig("dataURL").replace(/\/$/, "")}/cedis.json`,
                "json",
            ),
        ))();
    return dataRequest;
};

const stateFor = (id: string): CedisState => {
    let state = states.get(id);
    if (state !== undefined) return state;
    state = { selectedCodes: [], suggestions: [] };
    states.set(id, state);
    return state;
};

const render = async (module: Module): Promise<void> => {
    const parent = document.getElementById(module.parentId);
    if (parent === null) return;
    const catalog = await requestData();
    const state = stateFor(module.rootId);
    if (module.mode === "editor") renderEditor(parent, module.rootId, catalog, state);
    else renderSummary(parent, module.rootId, catalog, state);
};

const renderRoot = async (rootId: string): Promise<void> => {
    await Promise.all(
        [...modules.values()]
            .filter((module) => module.rootId === rootId)
            .map(render),
    );
};

const notifyStatus = (rootId: string): void => {
    for (const module of modules.values()) {
        if (module.rootId !== rootId) continue;
        document.getElementById(module.parentId)?.dispatchEvent(
            new CustomEvent("papiertiger:tool-status", { bubbles: true }),
        );
        break;
    }
};

const moveCode = (codes: string[], code: string, offset: number): string[] => {
    const index = codes.indexOf(code);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= codes.length) return codes;
    const next = [...codes];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
};

const handleClick = async (module: Module, event: Event): Promise<void> => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("button[data-action]");
    const parent = document.getElementById(module.parentId);
    if (button === null || parent === null || !parent.contains(button)) return;
    const action = button.dataset.action;
    const state = stateFor(module.rootId);
    const code = button.dataset.code;
    if (action === "open-editor") {
        parent.dispatchEvent(
            new CustomEvent("papiertiger:open-tool", {
                bubbles: true,
                detail: {
                    plugin: "cedis",
                    id: module.rootId,
                    label: "CEDIS PCL",
                    params: { id: module.rootId, mode: "editor" },
                },
            }),
        );
        return;
    }
    if (code === undefined) return;
    if (action === "add-code" && !state.selectedCodes.includes(code)) {
        state.selectedCodes.push(code);
    } else if (action === "remove-code") {
        state.selectedCodes = state.selectedCodes.filter((candidate) => candidate !== code);
    } else if (action === "move-up") {
        state.selectedCodes = moveCode(state.selectedCodes, code, -1);
    } else if (action === "move-down") {
        state.selectedCodes = moveCode(state.selectedCodes, code, 1);
    } else {
        return;
    }
    await renderRoot(module.rootId);
    notifyStatus(module.rootId);
};

const attachEvents = (parent: HTMLElement, module: Module): void => {
    parent.addEventListener("click", (event) => void handleClick(module, event));
};

const selection = (catalog: CedisCatalog, code: string): CedisSelection | null => {
    const entry = catalog.entries.find((candidate) => candidate.code === code);
    if (entry === undefined) return null;
    return {
        system: catalog.system,
        version: catalog.version,
        code: entry.code,
        display: entry.label,
        category: entry.category,
    };
};

export const init = async (): Promise<void> => {
    await requestData();
};

export const display = async (
    parentId: string,
    params: Record<string, unknown>,
): Promise<void> => {
    const parent = document.getElementById(parentId);
    if (parent === null) throw new Error(`Parent "${parentId}" was not found`);
    const rootId = typeof params.id === "string" ? params.id : "cedis";
    const mode = params.mode === "editor" ? "editor" : "summary";
    let module = modules.get(parentId);
    if (module === undefined) {
        module = { parentId, rootId, mode };
        modules.set(parentId, module);
        attachEvents(parent, module);
    } else {
        module.rootId = rootId;
        module.mode = mode;
    }
    await render(module);
};

export const getSelection = async (id: string): Promise<CedisEntry[]> => {
    const catalog = await requestData();
    const entries = new Map(catalog.entries.map((entry) => [entry.code, entry]));
    return stateFor(id).selectedCodes.flatMap((code) => {
        const entry = entries.get(code);
        return entry === undefined ? [] : [entry];
    });
};

export const getValue = async (id: string): Promise<string> => {
    const selected = await getSelection(id);
    return selected.length === 0
        ? ""
        : `CEDIS PCL: ${selected.map((entry) => `${entry.code} ${entry.label}`).join("; ")}`;
};

export const getStructuredValue = async (
    id: string,
): Promise<CedisStructuredValue | null> => {
    const catalog = await requestData();
    const selections = stateFor(id).selectedCodes.flatMap((code) => {
        const selected = selection(catalog, code);
        return selected === null ? [] : [selected];
    });
    return selections.length === 0
        ? null
        : { system: catalog.system, version: catalog.version, selections };
};

export const receive = async (message: PluginMessage): Promise<void> => {
    if (message.type !== "cedis-suggestions" || !isRecord(message.payload)) return;
    const rootId = typeof message.payload.id === "string" ? message.payload.id : "cedis";
    if (!Array.isArray(message.payload.suggestions)) return;
    const catalog = await requestData();
    const knownCodes = new Set(catalog.entries.map((entry) => entry.code));
    const suggestions = message.payload.suggestions.filter(
        (candidate): candidate is CedisSuggestion =>
            isRecord(candidate) &&
            typeof candidate.code === "string" &&
            knownCodes.has(candidate.code) &&
            Array.isArray(candidate.sources) &&
            candidate.sources.every((source) => typeof source === "string") &&
            Array.isArray(candidate.relations) &&
            candidate.relations.every((relation) => typeof relation === "string"),
    );
    stateFor(rootId).suggestions = suggestions;
    await renderRoot(rootId);
    notifyStatus(rootId);
};

export const getToolStatus = async (id: string): Promise<ToolStatus> => {
    const state = stateFor(id);
    const pending = state.suggestions.filter(
        (suggestion) => !state.selectedCodes.includes(suggestion.code),
    ).length;
    return {
        ...(state.selectedCodes.length > 0
            ? { badge: String(state.selectedCodes.length) }
            : pending > 0
              ? { badge: String(pending) }
              : {}),
        attention: pending > 0,
    };
};

export const dispose = (parentId: string): void => {
    modules.delete(parentId);
};
