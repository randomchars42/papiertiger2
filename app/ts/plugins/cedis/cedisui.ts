import type {
    CedisCatalog,
    CedisEntry,
    CedisState,
    CedisSuggestion,
} from "./cedistypes.js";

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

const actionButton = (
    label: string,
    action: string,
    data: Record<string, string> = {},
    className = "control",
): HTMLButtonElement => {
    const button = element("button", className, label);
    button.type = "button";
    button.dataset.action = action;
    Object.assign(button.dataset, data);
    return button;
};

const entriesByCode = (catalog: CedisCatalog): Map<string, CedisEntry> =>
    new Map(catalog.entries.map((entry) => [entry.code, entry]));

const categoryNames = (catalog: CedisCatalog): Map<string, string> =>
    new Map(catalog.categories.map((category) => [category.code, category.label]));

const selectionRow = (
    entry: CedisEntry,
    category: string,
    index: number,
    count: number,
): HTMLElement => {
    const row = element("div", "cedis-choice");
    row.append(
        element("span", "cedis-code", entry.code),
        element("span", "cedis-choice__label", entry.label),
        element("span", "status", category),
    );
    const tools = element("span", "group__tools");
    const up = actionButton("↑", "move-up", { code: entry.code }, "control control--icon");
    up.setAttribute("aria-label", `${entry.label} nach oben verschieben`);
    up.disabled = index === 0;
    const down = actionButton("↓", "move-down", { code: entry.code }, "control control--icon");
    down.setAttribute("aria-label", `${entry.label} nach unten verschieben`);
    down.disabled = index === count - 1;
    const remove = actionButton(
        "×",
        "remove-code",
        { code: entry.code },
        "control control--icon control--danger",
    );
    remove.setAttribute("aria-label", `${entry.label} entfernen`);
    tools.append(up, down, remove);
    row.append(tools);
    return row;
};

const suggestionRow = (
    suggestion: CedisSuggestion,
    entry: CedisEntry,
    category: string,
): HTMLElement => {
    const row = element("div", "cedis-choice");
    const select = actionButton(
        `${entry.code} · ${entry.label}`,
        "add-code",
        { code: entry.code },
        "choice choice--neutral cedis-choice__select",
    );
    select.setAttribute("aria-label", `${entry.code} ${entry.label} übernehmen`);
    row.append(
        select,
        element(
            "span",
            "status cedis-choice__context",
            `${category} · aus ${suggestion.sources.join(", ")}`,
        ),
    );
    return row;
};

const renderSources = (catalog: CedisCatalog): HTMLDetailsElement => {
    const details = element("details", "group group--neutral cedis-sources");
    details.append(
        element("summary", "group__toggle", `Quelle und Version · CEDIS PCL ${catalog.version}`),
    );
    const content = element("div", "group__content");
    content.append(
        element(
            "p",
            undefined,
            `Codesystem ${catalog.system} · Original ${catalog.originalDate} · deutsche Übersetzung ${catalog.translationDate}`,
        ),
    );
    const list = element("ul");
    for (const source of catalog.sources) {
        const item = element("li");
        const link = element("a", undefined, source.label);
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noreferrer";
        item.append(link);
        list.append(item);
    }
    content.append(list, element("p", undefined, catalog.license));
    details.append(content);
    return details;
};

export const renderSummary = (
    parent: HTMLElement,
    rootId: string,
    catalog: CedisCatalog,
    state: CedisState,
): void => {
    parent.replaceChildren();
    parent.className = "cedis-module cedis-module--summary";
    parent.dataset.rootId = rootId;
    const documentNode = element("article", "document cedis-summary");
    const header = element("header", "group__header");
    header.append(element("h2", "group__heading", "CEDIS PCL"));
    header.append(
        actionButton(
            state.selectedCodes.length === 0 ? "Auswählen" : "Bearbeiten",
            "open-editor",
        ),
    );
    documentNode.append(header);
    const entries = entriesByCode(catalog);
    const selected = element("div", "phrases cedis-summary__choices");
    for (const code of state.selectedCodes) {
        const entry = entries.get(code);
        if (entry === undefined) continue;
        selected.append(
            element(
                "span",
                "phrase phrase--neutral phrase--included cedis-summary__choice",
                `${entry.code} ${entry.label}`,
            ),
        );
    }
    if (selected.childElementCount === 0) {
        selected.append(
            element(
                "span",
                "group__summary-empty",
                state.suggestions.length === 0
                    ? "Keine Auswahl"
                    : `${state.suggestions.length} Vorschläge verfügbar`,
            ),
        );
    }
    documentNode.append(selected);
    parent.append(documentNode);
};

export const renderEditor = (
    parent: HTMLElement,
    rootId: string,
    catalog: CedisCatalog,
    state: CedisState,
): void => {
    parent.replaceChildren();
    parent.className = "cedis-module cedis-module--editor";
    parent.dataset.rootId = rootId;
    const entries = entriesByCode(catalog);
    const categories = categoryNames(catalog);

    const selectedGroup = element("section", "group group--neutral");
    const selectedHeader = element("header", "group__header");
    selectedHeader.append(element("h3", "group__heading", "Ausgewählt und geordnet"));
    const selected = element("div", "group__body cedis-choice-list");
    for (const [index, code] of state.selectedCodes.entries()) {
        const entry = entries.get(code);
        if (entry === undefined) continue;
        selected.append(
            selectionRow(
                entry,
                categories.get(entry.category) ?? entry.category,
                index,
                state.selectedCodes.length,
            ),
        );
    }
    if (selected.childElementCount === 0) {
        selected.append(element("p", "group__content", "Noch kein PCL-Eintrag ausgewählt."));
    }
    selectedGroup.append(selectedHeader, selected);

    const suggestionGroup = element("section", "group group--neutral");
    const suggestionHeader = element("header", "group__header");
    suggestionHeader.append(element("h3", "group__heading", "Aus Symptomen vorgeschlagen"));
    const suggestions = element("div", "group__body cedis-choice-list");
    for (const suggestion of state.suggestions) {
        if (state.selectedCodes.includes(suggestion.code)) continue;
        const entry = entries.get(suggestion.code);
        if (entry === undefined) continue;
        suggestions.append(
            suggestionRow(
                suggestion,
                entry,
                categories.get(entry.category) ?? entry.category,
            ),
        );
    }
    if (suggestions.childElementCount === 0) {
        suggestions.append(
            element(
                "p",
                "group__content",
                state.suggestions.length === 0
                    ? "Die ausgewählten Symptome liefern noch keine PCL-Vorschläge."
                    : "Alle vorgeschlagenen Einträge wurden übernommen.",
            ),
        );
    }
    suggestionGroup.append(suggestionHeader, suggestions);
    parent.append(selectedGroup, suggestionGroup, renderSources(catalog));
};
