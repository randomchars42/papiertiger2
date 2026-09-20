import * as config from "./config.js";
import * as baselib from "@lib/base.js";
import { getConfig, initialiseConfig } from "@lib/config.js";
import { loadPlugin } from "@lib/plugin.js";
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const validateDocuments = (value) => {
    if (!isRecord(value) ||
        value.version !== 1 ||
        typeof value.default !== "string" ||
        !isRecord(value.documents)) {
        throw new Error("Die Dokumentdefinition ist ungültig.");
    }
    for (const [id, candidate] of Object.entries(value.documents)) {
        if (!isRecord(candidate) ||
            typeof candidate.title !== "string" ||
            !Array.isArray(candidate.blocks)) {
            throw new Error(`Das Dokument "${id}" ist ungültig.`);
        }
        for (const block of candidate.blocks) {
            if (!isRecord(block) ||
                typeof block.plugin !== "string" ||
                !isRecord(block.params) ||
                typeof block.params.id !== "string") {
                throw new Error(`Ein Block in Dokument "${id}" ist ungültig.`);
            }
        }
    }
    if (!(value.default in value.documents)) {
        throw new Error(`Das Standarddokument "${value.default}" fehlt.`);
    }
    return value;
};
const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className !== undefined)
        node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
};
const button = (label, action) => {
    const node = element("button", "control", label);
    node.type = "button";
    node.dataset.documentAction = action;
    return node;
};
const copyToClipboard = async (text) => {
    if (navigator.clipboard !== undefined && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = element("textarea", "clipboard-fallback");
    textarea.value = text;
    textarea.readOnly = true;
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied)
        throw new Error("Clipboard access failed");
};
const showError = (error) => {
    console.error(error);
    const parent = document.getElementById("Editor__body");
    if (parent === null)
        return;
    const message = element("p", "error");
    message.textContent =
        error instanceof Error
            ? error.message
            : "Die Anwendung konnte nicht geladen werden.";
    parent.replaceChildren(message);
};
const run = async () => {
    config.configure();
    initialiseConfig();
    const catalog = validateDocuments(await baselib.load(`${getConfig("dataURL").replace(/\/$/, "")}/documents.json`, "json"));
    const host = document.getElementById("Editor__body");
    if (host === null)
        throw new Error("Der Dokumentbereich wurde nicht gefunden.");
    const shell = element("div", "document-shell");
    const toolbar = element("header", "toolbar document-shell__toolbar");
    const label = element("label", "document-shell__label", "Dokument");
    const select = element("select", "document-shell__select");
    select.setAttribute("aria-label", "Dokument auswählen");
    for (const [id, definition] of Object.entries(catalog.documents)) {
        const option = element("option", undefined, definition.title);
        option.value = id;
        select.append(option);
    }
    label.append(select);
    const copyText = button("Dokument kopieren", "copy-text");
    const copyData = button("Daten kopieren", "copy-data");
    const status = element("span", "status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    toolbar.append(label, copyText, copyData, status);
    const content = element("div", "document-shell__content");
    shell.append(toolbar, content);
    host.replaceChildren(shell);
    const queryDocument = new URL(window.location.href).searchParams.get("document");
    let currentId = queryDocument !== null && queryDocument in catalog.documents
        ? queryDocument
        : catalog.default;
    let currentBlocks = [];
    let revision = 0;
    select.value = currentId;
    const renderDocument = async (id) => {
        const definition = catalog.documents[id];
        if (definition === undefined)
            return;
        currentId = id;
        revision += 1;
        const currentRevision = revision;
        status.textContent = "";
        for (const block of currentBlocks)
            block.plugin.dispose?.(block.parentId);
        content.replaceChildren();
        currentBlocks = [];
        for (const [index, block] of definition.blocks.entries()) {
            const parent = element("section", "document-shell__block");
            parent.id = `Document__${currentRevision}__${index}`;
            content.append(parent);
            const plugin = await loadPlugin(block.plugin);
            if (currentRevision !== revision)
                return;
            if (plugin.display === undefined) {
                throw new Error(`Plugin "${block.plugin}" kann nicht angezeigt werden.`);
            }
            await plugin.display(parent.id, block.params);
            if (currentRevision !== revision) {
                plugin.dispose?.(parent.id);
                return;
            }
            currentBlocks.push({ definition: block, plugin, parentId: parent.id });
        }
    };
    const documentValues = async (structured) => Promise.all(currentBlocks.map(async ({ definition, plugin }) => {
        const getter = structured
            ? plugin.getStructuredValue
            : plugin.getValue;
        const value = getter === undefined
            ? null
            : await getter(definition.params.id);
        return {
            plugin: definition.plugin,
            params: definition.params,
            value,
        };
    }));
    select.addEventListener("change", () => {
        void renderDocument(select.value).catch(showError);
    });
    toolbar.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element))
            return;
        const action = target.closest("button[data-document-action]")?.dataset.documentAction;
        if (action !== "copy-text" && action !== "copy-data")
            return;
        void (async () => {
            try {
                const blocks = await documentValues(action === "copy-data");
                const output = action === "copy-data"
                    ? JSON.stringify({ version: 1, document: currentId, blocks }, null, 2)
                    : blocks
                        .map((block) => block.value)
                        .filter((value) => typeof value === "string" && value !== "")
                        .join("\n\n");
                await copyToClipboard(output);
                status.textContent =
                    action === "copy-data" ? "Daten kopiert" : "Dokument kopiert";
            }
            catch (error) {
                console.error(error);
                status.textContent = "Kopieren nicht möglich";
            }
        })();
    });
    await renderDocument(currentId);
};
void run().catch(showError);
