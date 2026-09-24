import {
    isDateTimeValue,
    isDurationValue,
    parseValue,
} from "./textblocklib.js";
import {
    groupPhrasePresence,
    groupItems,
    isGroupConditionMet,
    isGroupEnabled,
    phraseKey,
    scopeState,
    summarizeGroup,
} from "./textblockstate.js";
import { getSymptomLens, symptomLenses } from "@lib/symptomlens.js";
import {
    matchesSearchTokens,
    normaliseSearch,
    searchTokens,
} from "@lib/search.js";
import type {
    AttributeValue,
    Definitions,
    DocumentState,
    DurationUnit,
    EditorDefinition,
    ResolvedDocument,
    ResolvedPhrase,
} from "./textblocktypes.js";

export type OpenEditor =
    | { type: "phrase"; phraseId: string; instanceId?: string }
    | {
          type: "attribute";
          phraseId: string;
          attributeId: string;
          instanceId?: string;
      }
    | null;

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

const iconActionButton = (
    symbol: string,
    label: string,
    action: string,
    data: Record<string, string>,
    className: string,
): HTMLButtonElement => {
    const button = actionButton(symbol, action, data, `${className} control--icon`);
    button.setAttribute("aria-label", label);
    button.title = label;
    return button;
};

const scopedData = (
    data: Record<string, string>,
    instanceId?: string,
): Record<string, string> =>
    instanceId === undefined ? data : { ...data, instanceId };

const editorMatches = (
    editor: OpenEditor,
    type: "phrase" | "attribute",
    phraseId: string,
    instanceId?: string,
): boolean =>
    editor?.type === type &&
    editor.phraseId === phraseId &&
    editor.instanceId === instanceId;

const instanceLabel = (
    instanceId: string | undefined,
    definitions: Definitions,
    state: DocumentState,
): string => {
    if (instanceId === undefined) return "";
    for (const [groupId, instanceIds] of Object.entries(state.groupInstances)) {
        const index = instanceIds.indexOf(instanceId);
        if (index >= 0) {
            return `${parseValue(definitions.groups[groupId].title).text} ${index + 1}: `;
        }
    }
    return "";
};

const CATALOG_RESULT_LIMIT = 24;

export const renderPhraseEditor = (
    phraseId: string,
    instanceId: string | undefined,
    definitions: Definitions,
    resolved: ResolvedPhrase,
    query = "",
): HTMLElement => {
    const editor = element("div", "inline-editor phrase-editor");
    editor.dataset.editorFor = resolved.key;
    editor.setAttribute("role", "group");
    editor.setAttribute("aria-label", `${resolved.title} auswählen`);

    const phrase = definitions.phrases[phraseId];
    const catalog =
        phrase.catalog === undefined
            ? undefined
            : definitions.catalogs[phrase.catalog];
    if (catalog !== undefined) {
        editor.classList.add("catalog-picker");
        const search = element("input", "editor-input catalog-picker__search");
        search.type = "search";
        search.value = query;
        search.autocomplete = "off";
        search.spellcheck = false;
        search.placeholder = `${resolved.title} suchen …`;
        search.dataset.input = "catalog-search";
        search.dataset.phraseId = phraseId;
        if (instanceId !== undefined) search.dataset.instanceId = instanceId;
        search.setAttribute("aria-label", `${resolved.title} suchen`);
        editor.append(search);

        if (catalog.lenses.length > 0) {
            const lens = element("select", "catalog-picker__lens");
            lens.dataset.input = "symptom-lens";
            lens.setAttribute("aria-label", "Symptomlinse auswählen");
            for (const definition of symptomLenses()) {
                const option = element("option", undefined, definition.label);
                option.value = definition.id;
                lens.append(option);
            }
            lens.value = getSymptomLens();
            editor.append(lens);
        }
    }

    const tokens = searchTokens(query);
    const candidates = Object.entries(phrase.values).filter(([, value]) => {
        if (value.freeText === true) return false;
        if (catalog === undefined) return true;
        if (tokens.length === 0) {
            return (
                catalog.lenses.length === 0 ||
                value.lenses?.includes(getSymptomLens()) === true
            );
        }
        const searchable = value.search ?? normaliseSearch(parseValue(value).text);
        return matchesSearchTokens(searchable, tokens);
    });
    const visible =
        catalog === undefined
            ? candidates
            : candidates.slice(0, CATALOG_RESULT_LIMIT);
    for (const [valueId, value] of visible) {
        const parsed = parseValue(value);
        const button = actionButton(
            parsed.text,
            "choose-value",
            scopedData({ phraseId, valueId }, instanceId),
            `choice choice--${parsed.kind ?? "neutral"}`,
        );
        button.setAttribute(
            "aria-pressed",
            String(resolved.included && resolved.valueId === valueId),
        );
        editor.append(button);
    }

    if (catalog !== undefined && candidates.length > visible.length) {
        editor.append(
            element(
                "span",
                "status catalog-picker__status",
                `${visible.length} von ${candidates.length} · Suche verfeinern`,
            ),
        );
    }
    const freeText = Object.entries(phrase.values).find(
        ([, value]) => value.freeText === true,
    );
    if (catalog !== undefined && tokens.length > 0 && freeText !== undefined) {
        editor.append(
            actionButton(
                `„${query.trim()}“ als Freitext`,
                "choose-freetext",
                scopedData(
                    { phraseId, valueId: freeText[0], value: query.trim() },
                    instanceId,
                ),
                "choice choice--abnormal",
            ),
        );
    }

    editor.append(
        actionButton(
            "− Weglassen",
            "exclude-phrase",
            scopedData({ phraseId }, instanceId),
        ),
        actionButton(
            "↺ Zurücksetzen",
            "reset-phrase",
            scopedData({ phraseId }, instanceId),
        ),
        actionButton("Fertig", "close-editor", {}, "control control--primary"),
    );
    return editor;
};

const editorValue = (
    state: DocumentState,
    phraseId: string,
    attributeId: string,
    instanceId?: string,
): AttributeValue | undefined =>
    scopeState(state, instanceId).attributes[phraseId]?.[attributeId];

const input = (
    type: string,
    phraseId: string,
    attributeId: string,
    value: string,
    instanceId?: string,
): HTMLInputElement => {
    const field = element("input", "editor-input");
    field.type = type;
    field.value = value;
    field.dataset.input = "attribute";
    field.dataset.phraseId = phraseId;
    field.dataset.attributeId = attributeId;
    if (instanceId !== undefined) field.dataset.instanceId = instanceId;
    field.setAttribute("aria-label", attributeId);
    return field;
};

const renderNumberEditor = (
    node: HTMLElement,
    editor: Extract<EditorDefinition, { type: "number" }>,
    phraseId: string,
    attributeId: string,
    instanceId: string | undefined,
    value?: AttributeValue,
): void => {
    const number = typeof value === "number" ? value : (editor.default ?? 0);
    node.append(
        actionButton(
            "−",
            "step-number",
            scopedData(
                { phraseId, attributeId, delta: String(-(editor.step ?? 1)) },
                instanceId,
            ),
        ),
    );
    const field = input(
        "number",
        phraseId,
        attributeId,
        String(number),
        instanceId,
    );
    field.inputMode = "decimal";
    field.step = String(editor.step ?? 1);
    if (editor.min !== undefined) field.min = String(editor.min);
    if (editor.max !== undefined) field.max = String(editor.max);
    node.append(field);
    node.append(
        actionButton(
            "+",
            "step-number",
            scopedData(
                { phraseId, attributeId, delta: String(editor.step ?? 1) },
                instanceId,
            ),
        ),
    );
};

const renderDurationEditor = (
    node: HTMLElement,
    editor: Extract<EditorDefinition, { type: "duration" }>,
    phraseId: string,
    attributeId: string,
    instanceId: string | undefined,
    value?: AttributeValue,
): void => {
    const duration = isDurationValue(value)
        ? value
        : {
              amount: 1,
              unit: editor.defaultUnit ?? editor.units?.[0] ?? "day",
              anchor: "",
          };
    node.append(
        actionButton(
            "−",
            "step-duration",
            scopedData({ phraseId, attributeId, delta: "-1" }, instanceId),
        ),
    );
    const field = input(
        "number",
        phraseId,
        attributeId,
        String(duration.amount),
        instanceId,
    );
    field.inputMode = "numeric";
    field.min = "1";
    field.step = "1";
    field.dataset.durationUnit = duration.unit;
    node.append(field);
    node.append(
        actionButton(
            "+",
            "step-duration",
            scopedData({ phraseId, attributeId, delta: "1" }, instanceId),
        ),
    );

    const units: DurationUnit[] = editor.units ?? [
        "minute",
        "hour",
        "day",
        "week",
        "month",
        "year",
    ];
    const unitLabels: Record<DurationUnit, string> = {
        minute: "Minute",
        hour: "Stunde",
        day: "Tag",
        week: "Woche",
        month: "Monat",
        year: "Jahr",
    };
    const unitsNode = element("span", "editor-units");
    for (const unit of units) {
        const button = actionButton(
            unitLabels[unit],
            "choose-duration-unit",
            scopedData({ phraseId, attributeId, unit }, instanceId),
            "choice choice--neutral choice--small",
        );
        button.setAttribute("aria-pressed", String(duration.unit === unit));
        unitsNode.append(button);
    }
    node.append(unitsNode);
};

const renderAttributeEditor = (
    phraseId: string,
    attributeId: string,
    instanceId: string | undefined,
    definitions: Definitions,
    state: DocumentState,
): HTMLElement => {
    const editorId = definitions.phrases[phraseId].attributes?.[attributeId];
    const definition = definitions.editors[editorId ?? ""];
    const value = editorValue(state, phraseId, attributeId, instanceId);
    const node = element("div", "inline-editor attribute-editor");
    node.dataset.editorFor = phraseKey(phraseId, instanceId);
    node.setAttribute("role", "group");
    node.setAttribute("aria-label", definition.label ?? attributeId);

    if (definition.type === "choice") {
        for (const [choice, option] of Object.entries(definition.options)) {
            const parsed = parseValue(option);
            const button = actionButton(
                parsed.text,
                "choose-attribute",
                scopedData(
                    { phraseId, attributeId, value: choice },
                    instanceId,
                ),
                `choice choice--${parsed.kind ?? "neutral"}`,
            );
            button.setAttribute("aria-pressed", String(value === choice));
            node.append(button);
        }
    } else if (definition.type === "number") {
        renderNumberEditor(
            node,
            definition,
            phraseId,
            attributeId,
            instanceId,
            value,
        );
    } else if (definition.type === "duration") {
        renderDurationEditor(
            node,
            definition,
            phraseId,
            attributeId,
            instanceId,
            value,
        );
    } else if (definition.type === "date") {
        node.append(
            input(
                "date",
                phraseId,
                attributeId,
                typeof value === "string" ? value : "",
                instanceId,
            ),
        );
    } else if (definition.type === "datetime") {
        node.append(
            input(
                "datetime-local",
                phraseId,
                attributeId,
                isDateTimeValue(value) ? value.local : "",
                instanceId,
            ),
        );
    } else {
        const field = input(
            "text",
            phraseId,
            attributeId,
            typeof value === "string" ? value : "",
            instanceId,
        );
        field.placeholder = definition.placeholder ?? definition.label ?? "";
        node.append(field);
    }

    node.append(
        actionButton(
            "Leeren",
            "clear-attribute",
            scopedData({ phraseId, attributeId }, instanceId),
        ),
        actionButton("Fertig", "close-editor", {}, "control control--primary"),
    );
    return node;
};

const renderPhrase = (
    parent: HTMLElement,
    phraseId: string,
    instanceId: string | undefined,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    openEditor: OpenEditor,
    highlightedSuggestions: ReadonlySet<string>,
    pickerQueries: Readonly<Record<string, string>>,
): void => {
    const phrase = resolved.phrases[phraseKey(phraseId, instanceId)];
    if (phrase === undefined || !phrase.visible) return;

    const classes = ["phrase", `phrase--${phrase.kind}`];
    if (phrase.included) {
        classes.push("phrase--included");
    } else if (phrase.source === "suggestion") {
        classes.push("phrase--suggestion");
    } else {
        classes.push("phrase--available");
    }
    if (highlightedSuggestions.has(phrase.key)) {
        classes.push("phrase--new-suggestion");
    }
    if (phrase.touched) classes.push("phrase--touched");
    if (phrase.source === "set") classes.push("phrase--set");
    const phraseNode = element("span", classes.join(" "));
    phraseNode.dataset.phraseId = phraseId;
    if (instanceId !== undefined) phraseNode.dataset.instanceId = instanceId;
    phraseNode.title = definitions.phrases[phraseId].note ?? "";

    for (const part of phrase.parts) {
        if (part.type === "text") {
            if (part.text.trim() === "") continue;
            const button = actionButton(
                part.text,
                "phrase",
                scopedData({ phraseId }, instanceId),
                "phrase__part phrase__text",
            );
            button.setAttribute("aria-pressed", String(phrase.included));
            phraseNode.append(button);
        } else {
            const button = actionButton(
                part.text,
                "attribute",
                scopedData({ phraseId, attributeId: part.id }, instanceId),
                "phrase__part phrase__attribute",
            );
            button.setAttribute("aria-label", `${part.id}: ${part.text}`);
            phraseNode.append(button);
        }
    }
    phraseNode.append(element("span", "phrase__delimiter", ";"));
    parent.append(phraseNode);

    if (editorMatches(openEditor, "phrase", phraseId, instanceId)) {
        parent.append(
            renderPhraseEditor(
                phraseId,
                instanceId,
                definitions,
                phrase,
                pickerQueries[phrase.key] ?? "",
            ),
        );
    } else if (editorMatches(openEditor, "attribute", phraseId, instanceId)) {
        const attributeEditor = openEditor as Exclude<OpenEditor, null> & {
            type: "attribute";
        };
        parent.append(
            renderAttributeEditor(
                phraseId,
                attributeEditor.attributeId,
                instanceId,
                definitions,
                state,
            ),
        );
    }
};

type CompactGroupPathEntry = {
    groupId: string;
    instanceId?: string;
};

const renderCompactContents = (
    parent: HTMLElement,
    groupId: string,
    level: number,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    openEditor: OpenEditor,
    highlightedSuggestions: ReadonlySet<string>,
    pickerQueries: Readonly<Record<string, string>>,
    path: readonly CompactGroupPathEntry[],
    instanceId?: string,
): void => {
    const group = definitions.groups[groupId];
    let phraseIds: string[] = [];
    const renderPhrases = (): void => {
        if (phraseIds.length === 0) return;
        const phrases = element("div", "phrases");
        for (const phraseId of phraseIds) {
            renderPhrase(
                phrases,
                phraseId,
                instanceId,
                definitions,
                state,
                resolved,
                openEditor,
                highlightedSuggestions,
                pickerQueries,
            );
        }
        parent.append(phrases);
        phraseIds = [];
    };

    for (const item of groupItems(group)) {
        if (item.type === "phrase") {
            const phrase = resolved.phrases[phraseKey(item.id, instanceId)];
            if (
                phrase?.included === true ||
                (phrase?.visible === true && phrase.source === "suggestion")
            ) {
                phraseIds.push(item.id);
            }
            continue;
        }
        renderPhrases();
        const childId = item.id;
        const child = definitions.groups[childId];
        if (child.repeatable !== undefined && instanceId === undefined) {
            for (const [index, childInstanceId] of (
                state.groupInstances[childId] ?? []
            ).entries()) {
                renderCompactGroup(
                    parent,
                    childId,
                    level,
                    definitions,
                    state,
                    resolved,
                    openEditor,
                    highlightedSuggestions,
                    pickerQueries,
                    path,
                    childInstanceId,
                    index,
                );
            }
        } else {
            renderCompactGroup(
                parent,
                childId,
                level,
                definitions,
                state,
                resolved,
                openEditor,
                highlightedSuggestions,
                pickerQueries,
                path,
                instanceId,
            );
        }
    }
    renderPhrases();
};

function renderCompactGroup(
    parent: HTMLElement,
    groupId: string,
    level: number,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    openEditor: OpenEditor,
    highlightedSuggestions: ReadonlySet<string>,
    pickerQueries: Readonly<Record<string, string>>,
    path: readonly CompactGroupPathEntry[],
    instanceId?: string,
    instanceIndex?: number,
): void {
    const group = definitions.groups[groupId];
    const conditionMet = isGroupConditionMet(
        groupId,
        definitions,
        resolved,
        instanceId,
    );
    const enabled = isGroupEnabled(groupId, definitions, state, instanceId);
    const { included, suggested } = groupPhrasePresence(
        groupId,
        definitions,
        state,
        resolved,
        instanceId,
    );
    const activeHeading =
        (group.condition !== undefined && conditionMet) ||
        (group.default === false && enabled);
    if (
        !conditionMet ||
        !enabled ||
        (!included && !suggested && !activeHeading)
    ) {
        return;
    }
    const nextPath = [
        ...path,
        { groupId, ...(instanceId === undefined ? {} : { instanceId }) },
    ];
    const section = element(
        "section",
        [
            "group",
            `group--${group.kind ?? "neutral"}`,
            instanceIndex === undefined ? "" : "group--instance",
            "group--nested",
            `group--subgroups-${group.subgroups ?? "break"}`,
            included ? "group--included" : "",
            "group--compact",
            "group--compact-summary",
        ]
            .filter(Boolean)
            .join(" "),
    );
    section.dataset.groupId = groupId;
    if (instanceId !== undefined) section.dataset.instanceId = instanceId;

    const header = element("header", "group__header");
    const heading = element(
        `h${Math.min(6, Math.max(1, level))}` as keyof HTMLElementTagNameMap,
        "group__heading",
    );
    const baseTitle = parseValue(group.title).text;
    const title =
        instanceIndex === undefined ? baseTitle : `${baseTitle} ${instanceIndex + 1}`;
    const headingButton = actionButton(
        title,
        "open-group-path",
        scopedData(
            {
                groupId,
                groupPath: JSON.stringify(nextPath),
            },
            instanceId,
        ),
        "group__toggle",
    );
    headingButton.setAttribute("aria-expanded", "false");
    headingButton.title = group.note ?? "";
    const indicator = element("span", "group__indicator", "›");
    indicator.setAttribute("aria-hidden", "true");
    headingButton.append(indicator);
    heading.append(headingButton);
    header.append(heading);
    section.append(header);

    const body = element("div", "group__body group__body--compact-only");
    renderCompactContents(
        body,
        groupId,
        level + 1,
        definitions,
        state,
        resolved,
        openEditor,
        highlightedSuggestions,
        pickerQueries,
        nextPath,
        instanceId,
    );
    section.append(body);
    parent.append(section);
}

const renderRepeatable = (
    parent: HTMLElement,
    groupId: string,
    level: number,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    openEditor: OpenEditor,
    highlightedSuggestions: ReadonlySet<string>,
    compactOverrides: Readonly<Record<string, boolean>>,
    pickerQueries: Readonly<Record<string, string>>,
): void => {
    const group = definitions.groups[groupId];
    const container = element("div", "repeatable");
    container.dataset.repeatableGroupId = groupId;
    for (const [index, instanceId] of (state.groupInstances[groupId] ?? []).entries()) {
        renderGroup(
            container,
            groupId,
            level,
            definitions,
            state,
            resolved,
            openEditor,
            highlightedSuggestions,
            compactOverrides,
            pickerQueries,
            instanceId,
            index,
        );
    }
    const title = parseValue(group.title).text;
    const addLabel = group.repeatable?.add ?? `${title} hinzufügen`;
    const addButton = actionButton(
        title,
        "add-group-instance",
        { groupId },
        `group__toggle repeatable__add repeatable__add--${group.kind ?? "neutral"}`,
    );
    const indicator = element("span", "group__indicator", "+");
    indicator.setAttribute("aria-hidden", "true");
    addButton.append(indicator);
    addButton.setAttribute("aria-label", addLabel);
    addButton.title = addLabel;
    container.append(addButton);
    parent.append(container);
};

function renderGroup(
    parent: HTMLElement,
    groupId: string,
    level: number,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    openEditor: OpenEditor,
    highlightedSuggestions: ReadonlySet<string>,
    compactOverrides: Readonly<Record<string, boolean>>,
    pickerQueries: Readonly<Record<string, string>>,
    instanceId?: string,
    instanceIndex?: number,
): void {
    const group = definitions.groups[groupId];
    if (!isGroupConditionMet(groupId, definitions, resolved, instanceId)) return;
    const isInstanceRoot = instanceIndex !== undefined;
    const enabled = isGroupEnabled(groupId, definitions, state, instanceId);
    const { included, suggested } = groupPhrasePresence(
        groupId,
        definitions,
        state,
        resolved,
        instanceId,
    );
    const compactKey = phraseKey(groupId, instanceId);
    const compact = compactOverrides[compactKey] ?? (level > 1);
    const optional = group.default === false;
    const section = element(
        "section",
        [
            "group",
            `group--${group.kind ?? "neutral"}`,
            isInstanceRoot ? "group--instance" : "",
            level === 1 ? "group--root" : "group--nested",
            `group--subgroups-${group.subgroups ?? "break"}`,
            included ? "group--included" : "",
            enabled ? "" : "group--inactive",
            compact ? "group--compact" : "",
        ]
            .filter(Boolean)
            .join(" "),
    );
    section.dataset.groupId = groupId;
    if (instanceId !== undefined) section.dataset.instanceId = instanceId;

    const header = element("header", "group__header");
    const heading = element(
        `h${Math.min(6, Math.max(1, level))}` as keyof HTMLElementTagNameMap,
        "group__heading",
    );
    const baseTitle = parseValue(group.title).text;
    const title =
        instanceIndex === undefined ? baseTitle : `${baseTitle} ${instanceIndex + 1}`;
    const headingButton = actionButton(
        title,
        !enabled ? "toggle-group" : "toggle-compact",
        scopedData({ groupId }, instanceId),
        "group__toggle",
    );
    headingButton.setAttribute(
        "aria-expanded",
        String(enabled && !compact),
    );
    headingButton.title = group.note ?? "";
    const indicator = !enabled ? "+" : compact ? "›" : "";
    if (indicator !== "") {
        const indicatorNode = element("span", "group__indicator", indicator);
        indicatorNode.setAttribute("aria-hidden", "true");
        headingButton.append(indicatorNode);
    }
    heading.append(headingButton);
    header.append(heading);

    const scope = scopeState(state, instanceId);
    const tools = element("div", "group__tools");
    if (!compact && group.score !== undefined) {
        tools.append(
            actionButton(
                group.score.label,
                "open-score",
                scopedData({ groupId }, instanceId),
                "control control--primary group__score",
            ),
        );
    }
    for (const setId of compact ? [] : (group.sets ?? [])) {
        const set = definitions.sets[setId];
        const button = actionButton(
            set.title,
            "toggle-set",
            scopedData({ setId }, instanceId),
            `set set--${set.kind ?? "neutral"}`,
        );
        button.setAttribute("aria-pressed", String(scope.activeSets.includes(setId)));
        tools.append(button);
    }
    if (optional && enabled && !compact) {
        tools.append(
            iconActionButton(
                "−",
                `${title} deaktivieren`,
                "toggle-group",
                scopedData({ groupId }, instanceId),
                "control group__disable",
            ),
        );
    }
    if ((group.reset === true || isInstanceRoot) && (!compact || level === 1)) {
        tools.append(
            compact
                ? iconActionButton(
                      "↺",
                      "Zurücksetzen",
                      "reset-group",
                      scopedData({ groupId }, instanceId),
                      "control group__reset",
                  )
                : actionButton(
                      "↺ Zurücksetzen",
                      "reset-group",
                      scopedData({ groupId }, instanceId),
                      "control group__reset",
                  ),
        );
    }
    if (isInstanceRoot && instanceId !== undefined && !compact) {
        tools.append(
            actionButton(
                "Entfernen",
                "remove-group-instance",
                { groupId, instanceId },
                "control control--danger",
            ),
        );
    }
    if (tools.childElementCount > 0) header.append(tools);
    section.append(header);

    if (enabled && !compact) {
        const body = element("div", "group__body");
        if (group.summary === true && instanceId === undefined) {
            const summary = element("aside", "group__summary");
            summary.append(element("strong", "group__summary-label", "Auffällig:"));
            const findings = summarizeGroup(groupId, definitions, state, resolved);
            if (findings.length === 0) {
                summary.append(element("span", "group__summary-empty", "–"));
            } else {
                for (const finding of findings) {
                    summary.append(
                        element(
                            "span",
                            `group__summary-item phrase--${finding.kind}`,
                            `${instanceLabel(
                                finding.instanceId,
                                definitions,
                                state,
                            )}${finding.text}`,
                        ),
                    );
                }
            }
            body.append(summary);
        }
        if (group.content !== undefined && group.content !== "") {
            body.append(element("p", "group__content", group.content));
        }
        let phraseIds: string[] = [];
        const renderPhrases = (): void => {
            if (phraseIds.length === 0) return;
            const phrases = element("div", "phrases");
            const orderedPhraseIds = phraseIds
                .map((id, index) => ({ id, index }))
                .sort((left, right) => {
                    const leftIncluded =
                        resolved.phrases[phraseKey(left.id, instanceId)]?.included ===
                        true;
                    const rightIncluded =
                        resolved.phrases[phraseKey(right.id, instanceId)]?.included ===
                        true;
                    return (
                        Number(rightIncluded) - Number(leftIncluded) ||
                        left.index - right.index
                    );
                });
            for (const { id } of orderedPhraseIds) {
                renderPhrase(
                    phrases,
                    id,
                    instanceId,
                    definitions,
                    state,
                    resolved,
                    openEditor,
                    highlightedSuggestions,
                    pickerQueries,
                );
            }
            body.append(phrases);
            phraseIds = [];
        };
        for (const item of groupItems(group)) {
            if (item.type === "phrase") {
                phraseIds.push(item.id);
                continue;
            }
            renderPhrases();
            const child = item.id;
            if (
                definitions.groups[child].repeatable !== undefined &&
                instanceId === undefined
            ) {
                renderRepeatable(
                    body,
                    child,
                    level + 1,
                    definitions,
                    state,
                    resolved,
                    openEditor,
                    highlightedSuggestions,
                    compactOverrides,
                    pickerQueries,
                );
            } else {
                renderGroup(
                    body,
                    child,
                    level + 1,
                    definitions,
                    state,
                    resolved,
                    openEditor,
                    highlightedSuggestions,
                    compactOverrides,
                    pickerQueries,
                    instanceId,
                );
            }
        }
        renderPhrases();
        section.append(body);
    } else if (enabled) {
        if (included || suggested) {
            const body = element("div", "group__body group__body--compact-only");
            renderCompactContents(
                body,
                groupId,
                level + 1,
                definitions,
                state,
                resolved,
                openEditor,
                highlightedSuggestions,
                pickerQueries,
                [
                    {
                        groupId,
                        ...(instanceId === undefined ? {} : { instanceId }),
                    },
                ],
                instanceId,
            );
            section.append(body);
        }
    }
    parent.append(section);
}

export const renderModule = (
    parent: HTMLElement,
    rootId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    openEditor: OpenEditor,
    highlightedSuggestions: ReadonlySet<string>,
    compactOverrides: Readonly<Record<string, boolean>>,
    status: string,
    controls = true,
    pickerQueries: Readonly<Record<string, string>> = {},
): void => {
    parent.replaceChildren();
    parent.classList.add("textblock-module");
    parent.dataset.rootId = rootId;

    if (controls) {
        const toolbar = element("div", "toolbar");
        toolbar.append(
            actionButton("Text kopieren", "copy-text", { rootId }),
            actionButton("Daten kopieren", "copy-data", { rootId }),
            actionButton("↺ Zurücksetzen", "reset-group", { groupId: rootId }),
        );
        const live = element("span", "status", status);
        live.setAttribute("role", "status");
        live.setAttribute("aria-live", "polite");
        toolbar.append(live);
        parent.append(toolbar);
    }

    const documentNode = element("article", "document");
    renderGroup(
        documentNode,
        rootId,
        1,
        definitions,
        state,
        resolved,
        openEditor,
        highlightedSuggestions,
        compactOverrides,
        pickerQueries,
    );
    parent.append(documentNode);
};
