import { normalise } from "./cedislib.js";
import type {
    CedisCatalog,
    CedisEntry,
    CedisSearchResult,
} from "./cedistypes.js";

const RESULT_LIMIT = 40;

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

const region = (parent: HTMLElement, name: string): HTMLElement => {
    const node = parent.querySelector<HTMLElement>(`[data-region="${name}"]`);
    if (node === null) throw new Error(`CEDIS region "${name}" was not found`);
    return node;
};

const categoryNames = (catalog: CedisCatalog): Map<string, string> =>
    new Map(
        catalog.categories.map((category): [string, string] => [
            category.code,
            category.label,
        ]),
    );

const renderSelection = (
    parent: HTMLElement,
    catalog: CedisCatalog,
    selectedCode: string | null,
): void => {
    parent.replaceChildren();
    const selected = catalog.entries.find(
        (entry: CedisEntry) => entry.code === selectedCode,
    );
    if (selected === undefined) {
        parent.append(
            element(
                "span",
                "group__summary-empty",
                "Noch kein PCL-Code ausgewählt",
            ),
        );
        return;
    }

    const categories = categoryNames(catalog);
    parent.append(
        element("strong", undefined, "Auswahl:"),
        element("span", "cedis-code", selected.code),
        element("span", undefined, selected.label),
        element(
            "span",
            "status",
            categories.get(selected.category) ?? selected.category,
        ),
        actionButton("Auswahl löschen", "clear-selection"),
    );
};

const renderTags = (
    parent: HTMLElement,
    tags: string[],
    query: string,
): void => {
    parent.replaceChildren();
    for (const tag of tags) {
        const button = actionButton(
            tag,
            "search-tag",
            { query: tag },
            "choice choice--neutral choice--small",
        );
        button.setAttribute(
            "aria-pressed",
            String(normalise(query) === normalise(tag)),
        );
        parent.append(button);
    }
};

const resultStatus = (
    catalog: CedisCatalog,
    results: CedisSearchResult[],
    query: string,
): string => {
    if (normalise(query) === "") {
        return `${catalog.entries.length} Codes · Bereich wählen oder suchen`;
    }
    if (results.length === 1) return "1 passender Code";
    if (results.length > RESULT_LIMIT) {
        return `${results.length} passende Codes · erste ${RESULT_LIMIT} angezeigt`;
    }
    return `${results.length} passende Codes`;
};

const renderResult = (
    result: CedisSearchResult,
    categories: Map<string, string>,
    selectedCode: string | null,
): HTMLElement => {
    const { entry } = result;
    const item = element("article", "group group--neutral cedis-result");
    item.setAttribute("role", "listitem");

    const header = element("header", "group__header");
    const select = actionButton(
        entry.label,
        "select-code",
        { code: entry.code },
        "choice choice--neutral cedis-result__select",
    );
    select.replaceChildren(
        element("span", "cedis-code", entry.code),
        element("span", undefined, entry.label),
        element(
            "span",
            "status cedis-result__category",
            categories.get(entry.category) ?? entry.category,
        ),
    );
    select.setAttribute("aria-pressed", String(entry.code === selectedCode));
    select.setAttribute(
        "aria-label",
        `${entry.code} ${entry.label} auswählen`,
    );
    header.append(select);

    const tags = element("div", "group__tools cedis-result__tags");
    const visibleTags = [
        ...result.matchedTags,
        ...entry.tags.filter((tag: string) => !result.matchedTags.includes(tag)),
    ].slice(0, 5);
    for (const tag of visibleTags) {
        tags.append(
            actionButton(
                tag,
                "search-tag",
                { query: tag },
                "choice choice--neutral choice--small",
            ),
        );
    }
    if (tags.childElementCount > 0) header.append(tags);
    item.append(header);
    return item;
};

const renderResults = (
    parent: HTMLElement,
    catalog: CedisCatalog,
    results: CedisSearchResult[],
    query: string,
    selectedCode: string | null,
): void => {
    parent.replaceChildren();
    if (normalise(query) === "") {
        parent.append(
            element(
                "p",
                "group__content",
                "Ein Suchbegriff oder Bereich zeigt passende PCL-Codes.",
            ),
        );
        return;
    }
    if (results.length === 0) {
        parent.append(
            element(
                "p",
                "group__content",
                "Kein Treffer. Suche nach Symptom, Körperteil, Synonym oder dreistelligem Code.",
            ),
        );
        return;
    }

    const categories = categoryNames(catalog);
    for (const result of results.slice(0, RESULT_LIMIT)) {
        parent.append(renderResult(result, categories, selectedCode));
    }
};

const renderSources = (catalog: CedisCatalog): HTMLDetailsElement => {
    const details = element("details", "group group--neutral cedis-sources");
    details.append(
        element(
            "summary",
            "group__toggle",
            `Quelle und Version · CEDIS PCL ${catalog.version}`,
        ),
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

export const renderSearch = (
    parent: HTMLElement,
    catalog: CedisCatalog,
    results: CedisSearchResult[],
    tags: string[],
    query: string,
    selectedCode: string | null,
): void => {
    renderSelection(region(parent, "selection"), catalog, selectedCode);
    renderTags(region(parent, "tags"), tags, query);
    region(parent, "result-status").textContent = resultStatus(
        catalog,
        results,
        query,
    );
    renderResults(
        region(parent, "results"),
        catalog,
        results,
        query,
        selectedCode,
    );
};

export const renderModule = (
    parent: HTMLElement,
    rootId: string,
    catalog: CedisCatalog,
    results: CedisSearchResult[],
    tags: string[],
    query: string,
    selectedCode: string | null,
): void => {
    parent.replaceChildren();
    parent.classList.add("cedis-module");
    parent.dataset.rootId = rootId;

    const toolbar = element("div", "toolbar");
    toolbar.append(
        element("h2", "group__heading", "CEDIS-PCL-Code"),
        element("span", "status", `Version ${catalog.version}`),
    );
    parent.append(toolbar);

    const documentNode = element("article", "document");
    const selection = element("aside", "group__summary cedis-selection");
    selection.dataset.region = "selection";
    selection.setAttribute("aria-live", "polite");
    documentNode.append(selection);

    const search = element("div", "inline-editor cedis-search");
    const label = element("label", "group__heading", "PCL durchsuchen");
    label.htmlFor = `${rootId}__search`;
    const input = element("input", "editor-input cedis-search__input");
    input.id = `${rootId}__search`;
    input.type = "search";
    input.value = query;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "z. B. Atemnot, Schulter oder 003";
    input.dataset.input = "cedis-search";
    input.setAttribute("aria-controls", `${rootId}__results`);
    search.append(
        label,
        input,
        actionButton("Suche löschen", "clear-search"),
    );
    documentNode.append(search);

    const tagGroup = element("section", "group group--neutral");
    const tagHeader = element("header", "group__header");
    tagHeader.append(element("h3", "group__heading", "Suchbegriffe"));
    const tagList = element("div", "phrases");
    tagList.dataset.region = "tags";
    tagGroup.append(tagHeader, tagList);
    documentNode.append(tagGroup);

    const resultGroup = element("section", "group group--neutral");
    const resultHeader = element("header", "group__header");
    resultHeader.append(element("h3", "group__heading", "Treffer"));
    const status = element("span", "status");
    status.dataset.region = "result-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    resultHeader.append(status);
    const resultList = element("div", "group__body cedis-results");
    resultList.id = `${rootId}__results`;
    resultList.dataset.region = "results";
    resultList.setAttribute("role", "list");
    resultGroup.append(resultHeader, resultList);
    documentNode.append(resultGroup, renderSources(catalog));
    parent.append(documentNode);

    renderSearch(parent, catalog, results, tags, query, selectedCode);
};
