import { configure, getConfig } from "./config.js";
import { loadJSON } from "@lib/base.js";
import { loadPlugin } from "@lib/plugin.js";
import type { Plugin } from "@lib/plugin.js";
import {
    getSymptomLens,
    initialiseSymptomLenses,
    setSymptomLens,
    symptomLenses,
} from "@lib/symptomlens.js";

type DocumentBlock = {
    plugin: string;
    params: Record<string, unknown> & { id: string };
};

type ToolDefinition = DocumentBlock;

type DocumentDefinition = {
    title: string;
    blocks: DocumentBlock[];
};

type DocumentCatalog = {
    version: 1;
    default: string;
    documents: Record<string, DocumentDefinition>;
    tools?: ToolDefinition[];
};

type ToolRequest = {
    plugin: string;
    id: string;
    label: string;
    params: Record<string, unknown> & { id: string };
};

type DocumentBlockValue = {
    plugin: string;
    params: Record<string, unknown>;
    value: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const documentCatalog = (value: unknown): DocumentCatalog => {
    if (
        !isRecord(value) ||
        value.version !== 1 ||
        typeof value.default !== "string" ||
        !isRecord(value.documents) ||
        !(value.default in value.documents)
    ) {
        throw new Error("Die Dokumentdefinition ist ungültig.");
    }
    return value as DocumentCatalog;
};

const toolRequest = (value: unknown): ToolRequest | null => {
    if (
        !isRecord(value) ||
        typeof value.plugin !== "string" ||
        typeof value.id !== "string" ||
        typeof value.label !== "string" ||
        !isRecord(value.params) ||
        typeof value.params.id !== "string"
    ) {
        return null;
    }
    return value as ToolRequest;
};

const element = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

const button = (label: string, action: string): HTMLButtonElement => {
    const node = element("button", "control", label);
    node.type = "button";
    node.dataset.documentAction = action;
    return node;
};

const copyToClipboard = async (text: string): Promise<void> => {
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
    if (!copied) throw new Error("Clipboard access failed");
};

const showError = (error: unknown): void => {
    console.error(error);
    const parent = document.getElementById("Editor__body");
    if (parent === null) return;
    const message = element("p", "error");
    message.textContent =
        error instanceof Error
            ? error.message
            : "Die Anwendung konnte nicht geladen werden.";
    parent.replaceChildren(message);
};

const run = async (): Promise<void> => {
    configure();
    await initialiseSymptomLenses();
    const catalog = documentCatalog(
        await loadJSON(
            `${getConfig("dataURL").replace(/\/$/, "")}/documents.json`,
        ),
    );
    const host = document.getElementById("Editor__body");
    if (host === null) throw new Error("Der Dokumentbereich wurde nicht gefunden.");

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
    const lensLabel = element("label", "document-shell__label", "Linse");
    const lensSelect = element("select", "document-shell__select");
    lensSelect.setAttribute("aria-label", "Symptomlinse auswählen");
    for (const lens of symptomLenses()) {
        const option = element("option", undefined, lens.label);
        option.value = lens.id;
        lensSelect.append(option);
    }
    lensSelect.value = getSymptomLens();
    lensLabel.append(lensSelect);
    const copyText = button("Dokument kopieren", "copy-text");
    const copyData = button("Daten kopieren", "copy-data");
    const toolButtons = new Map<string, HTMLButtonElement>();
    for (const tool of catalog.tools ?? []) {
        const toolId = tool.params.id;
        const toolLabel =
            typeof tool.params.label === "string" ? tool.params.label : toolId;
        const toolButton = button(toolLabel, "open-tool");
        toolButton.dataset.toolPlugin = tool.plugin;
        toolButton.dataset.toolId = toolId;
        toolButton.dataset.toolLabel = toolLabel;
        toolButton.setAttribute("aria-pressed", "false");
        toolButtons.set(`${tool.plugin}:${toolId}`, toolButton);
        toolbar.append(toolButton);
    }
    const status = element("span", "status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    toolbar.prepend(label, lensLabel, copyText, copyData);
    toolbar.append(status);
    const body = element("div", "document-shell__body");
    const toolSurface = element("aside", "tool-surface");
    toolSurface.hidden = true;
    toolSurface.setAttribute("aria-label", "Werkzeuge");
    const toolHeader = element("header", "tool-surface__header");
    const toolTitle = element("h2", "tool-surface__title", "Werkzeug");
    const closeToolButton = button("Schließen", "close-tool");
    closeToolButton.classList.add("control--icon");
    toolHeader.append(toolTitle, closeToolButton);
    const toolContent = element("div", "tool-surface__content");
    toolSurface.append(toolHeader, toolContent);
    const content = element("div", "document-shell__content");
    body.append(toolSurface, content);
    shell.append(toolbar, body);
    host.replaceChildren(shell);

    const queryDocument = new URL(window.location.href).searchParams.get("document");
    let currentId =
        queryDocument !== null && queryDocument in catalog.documents
            ? queryDocument
            : catalog.default;
    let currentBlocks: Array<{
        definition: DocumentBlock;
        plugin: Plugin;
        parentId: string;
    }> = [];
    let revision = 0;
    let toolRevision = 0;
    let activeTool: {
        pluginName: string;
        id: string;
        plugin: Plugin;
        parentId: string;
    } | null = null;
    let toolReturnFocus: HTMLElement | null = null;
    select.value = currentId;

    const markActiveToolButton = (pluginName?: string, id?: string): void => {
        for (const [key, toolButton] of toolButtons) {
            toolButton.setAttribute(
                "aria-pressed",
                String(key === `${pluginName ?? ""}:${id ?? ""}`),
            );
        }
    };

    const closeTool = (restoreFocus = false): void => {
        toolRevision += 1;
        if (activeTool !== null) {
            activeTool.plugin.dispose?.(activeTool.parentId);
        }
        activeTool = null;
        toolContent.replaceChildren();
        toolSurface.hidden = true;
        shell.classList.remove("document-shell--tool-open");
        markActiveToolButton();
        if (restoreFocus && toolReturnFocus?.isConnected === true) {
            toolReturnFocus.focus();
        }
        toolReturnFocus = null;
    };

    const openTool = async (request: ToolRequest): Promise<void> => {
        toolRevision += 1;
        const currentToolRevision = toolRevision;
        if (activeTool !== null) {
            activeTool.plugin.dispose?.(activeTool.parentId);
        }
        activeTool = null;
        toolContent.replaceChildren();
        toolTitle.textContent = request.label;
        toolSurface.hidden = false;
        shell.classList.add("document-shell--tool-open");
        markActiveToolButton(request.plugin, request.id);

        const parent = element("div", "tool-surface__plugin");
        parent.id = `Tool__${currentToolRevision}`;
        toolContent.append(parent);
        const plugin = await loadPlugin(request.plugin);
        if (currentToolRevision !== toolRevision) return;
        if (plugin.display === undefined) {
            throw new Error(`Plugin "${request.plugin}" kann nicht angezeigt werden.`);
        }
        await plugin.display(parent.id, request.params);
        if (currentToolRevision !== toolRevision) {
            plugin.dispose?.(parent.id);
            return;
        }
        activeTool = {
            pluginName: request.plugin,
            id: request.id,
            plugin,
            parentId: parent.id,
        };
        closeToolButton.focus();
    };

    const refreshToolStatus = async (): Promise<void> => {
        await Promise.all(
            (catalog.tools ?? []).map(async (definition) => {
                const key = `${definition.plugin}:${definition.params.id}`;
                const toolButton = toolButtons.get(key);
                if (toolButton === undefined) return;
                const plugin = await loadPlugin(definition.plugin);
                const toolStatus = await plugin.getToolStatus?.(
                    definition.params.id,
                );
                const label = toolButton.dataset.toolLabel ?? definition.params.id;
                toolButton.textContent =
                    toolStatus?.badge === undefined
                        ? label
                        : `${label} (${toolStatus.badge})`;
                toolButton.classList.toggle(
                    "control--attention",
                    toolStatus?.attention === true,
                );
            }),
        );
    };

    const renderDocument = async (id: string): Promise<void> => {
        const definition = catalog.documents[id];
        if (definition === undefined) return;
        currentId = id;
        closeTool();
        revision += 1;
        const currentRevision = revision;
        status.textContent = "";
        for (const block of currentBlocks) block.plugin.dispose?.(block.parentId);
        content.replaceChildren();
        currentBlocks = [];

        for (const [index, block] of definition.blocks.entries()) {
            const parent = element("section", "document-shell__block");
            parent.id = `Document__${currentRevision}__${index}`;
            content.append(parent);
            const plugin = await loadPlugin(block.plugin);
            if (currentRevision !== revision) return;
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

    const documentValues = async (
        structured: boolean,
    ): Promise<DocumentBlockValue[]> =>
        Promise.all(
            currentBlocks.map(async ({ definition, plugin }) => {
                const getter = structured
                    ? plugin.getStructuredValue
                    : plugin.getValue;
                const value =
                    getter === undefined
                        ? null
                        : await getter(definition.params.id);
                return {
                    plugin: definition.plugin,
                    params: definition.params,
                    value,
                };
            }),
        );

    select.addEventListener("change", () => {
        void renderDocument(select.value).catch(showError);
    });
    lensSelect.addEventListener("change", () => {
        setSymptomLens(lensSelect.value);
    });
    document.addEventListener("papiertiger:symptom-lens-change", () => {
        lensSelect.value = getSymptomLens();
    });
    toolbar.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const actionButton = target.closest<HTMLButtonElement>(
            "button[data-document-action]",
        );
        const action = actionButton?.dataset.documentAction;
        if (action === "open-tool" && actionButton !== null) {
            const pluginName = actionButton.dataset.toolPlugin;
            const id = actionButton.dataset.toolId;
            if (pluginName === undefined || id === undefined) return;
            if (activeTool?.pluginName === pluginName && activeTool.id === id) {
                closeTool(true);
                return;
            }
            const definition = (catalog.tools ?? []).find(
                (candidate) =>
                    candidate.plugin === pluginName && candidate.params.id === id,
            );
            if (definition === undefined) return;
            toolReturnFocus = actionButton;
            const label =
                typeof definition.params.label === "string"
                    ? definition.params.label
                    : id;
            void openTool({
                plugin: pluginName,
                id,
                label,
                params: definition.params,
            }).catch(showError);
            return;
        }
        if (action !== "copy-text" && action !== "copy-data") return;
        void (async (): Promise<void> => {
            try {
                const blocks = await documentValues(action === "copy-data");
                const output =
                    action === "copy-data"
                        ? JSON.stringify(
                              { version: 1, document: currentId, blocks },
                              null,
                              2,
                          )
                        : blocks
                              .map((block) => block.value)
                              .filter(
                                  (value): value is string =>
                                      typeof value === "string" && value !== "",
                              )
                              .join("\n\n");
                await copyToClipboard(output);
                status.textContent =
                    action === "copy-data" ? "Daten kopiert" : "Dokument kopiert";
            } catch (error) {
                console.error(error);
                status.textContent = "Kopieren nicht möglich";
            }
        })();
    });

    closeToolButton.addEventListener("click", () => closeTool(true));
    shell.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || activeTool === null) return;
        event.preventDefault();
        closeTool(true);
    });
    shell.addEventListener("papiertiger:open-tool", (event) => {
        const customEvent = event as CustomEvent<unknown>;
        const request = toolRequest(customEvent.detail);
        if (request === null) return;
        customEvent.stopPropagation();
        toolReturnFocus =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        void openTool(request).catch(showError);
    });
    shell.addEventListener("papiertiger:plugin-message", (event) => {
        const customEvent = event as CustomEvent<unknown>;
        if (
            !isRecord(customEvent.detail) ||
            typeof customEvent.detail.type !== "string"
        ) {
            return;
        }
        const message = customEvent.detail;
        customEvent.stopPropagation();
        const receivers = new Set(currentBlocks.map((block) => block.plugin));
        void (async (): Promise<void> => {
            try {
                await Promise.all(
                    [...receivers].map(async (plugin) => {
                        await plugin.receive?.({
                            type: message.type as string,
                            payload: message.payload,
                        });
                    }),
                );
            } catch (error) {
                console.error(error);
                status.textContent = "Ergebnis konnte nicht übernommen werden";
            }
        })();
    });
    shell.addEventListener("papiertiger:tool-status", () => {
        void refreshToolStatus().catch((error: unknown) => console.error(error));
    });

    await renderDocument(currentId);
    await refreshToolStatus();
};

void run().catch(showError);
