import { attributePlaceholders, formatAttribute, groupHeading, isDateTimeValue, isDurationValue, parseValue, } from "./textblocklib.js";
import { groupPhrasePresence, groupItems, isGroupConditionMet, phraseKey, scopeState, summarizeGroup, } from "./textblockstate.js";
import { getSymptomLens } from "@lib/symptomlens.js";
import { matchesSearchTokens, normaliseSearch, searchTokens, } from "@lib/search.js";
import { actionButton, element, iconActionButton } from "@lib/dom.js";
const scopedData = (data, instanceId) => instanceId === undefined ? data : { ...data, instanceId };
const editorMatches = (editor, type, phraseId, instanceId) => editor?.type === type &&
    editor.phraseId === phraseId &&
    editor.instanceId === instanceId;
const attributeEditorMatches = (editor, phraseId, attributeId, instanceId) => editorMatches(editor, "attribute", phraseId, instanceId) &&
    editor?.type === "attribute" &&
    editor.attributeId === attributeId;
const instanceLabel = (instanceId, definitions, state) => {
    if (instanceId === undefined)
        return "";
    for (const [groupId, instanceIds] of Object.entries(state.groupInstances)) {
        const index = instanceIds.indexOf(instanceId);
        if (index >= 0) {
            return `${parseValue(definitions.groups[groupId].title).text} ${index + 1}: `;
        }
    }
    return "";
};
const CATALOG_RESULT_LIMIT = 24;
const pickerValueLabel = (text, attributes, definitions) => {
    const placeholders = attributePlaceholders(text);
    if (placeholders.length === 0)
        return { text, opensEditor: false };
    let cursor = 0;
    let rendered = "";
    let literalText = "";
    let onlyEditor;
    for (const placeholder of placeholders) {
        const literal = text.slice(cursor, placeholder.start);
        rendered += literal;
        literalText += literal;
        const editorId = attributes?.[placeholder.id];
        const editor = definitions.editors[editorId ?? ""];
        rendered += editor === undefined ? "…" : formatAttribute(editor);
        onlyEditor ??= editor;
        cursor = placeholder.end;
    }
    const tail = text.slice(cursor);
    rendered += tail;
    literalText += tail;
    rendered = rendered
        .replace(/\s+/g, " ")
        .replace(/\s+([,.;:])/g, "$1")
        .trim();
    if (placeholders.length === 1 &&
        literalText.trim() === "" &&
        onlyEditor !== undefined) {
        const prompt = onlyEditor.type === "text"
            ? (onlyEditor.placeholder ?? onlyEditor.label)
            : onlyEditor.label;
        const action = onlyEditor.type === "choice" ? "auswählen" : "eingeben";
        return {
            text: `${(prompt ?? rendered) || "Wert"} ${action} …`,
            opensEditor: true,
        };
    }
    return { text: rendered, opensEditor: true };
};
const directTextEntry = (values, attributes, definitions) => {
    const entries = values.flatMap(([valueId, value]) => {
        const text = parseValue(value).text;
        const placeholders = attributePlaceholders(text);
        if (placeholders.length !== 1)
            return [];
        const placeholder = placeholders[0];
        if (!placeholder.required ||
            text.slice(0, placeholder.start).trim() !== "" ||
            text.slice(placeholder.end).trim() !== "") {
            return [];
        }
        const editorId = attributes?.[placeholder.id];
        const editor = definitions.editors[editorId ?? ""];
        if (editor?.type !== "text")
            return [];
        return [
            {
                valueId,
                value,
                editor,
            },
        ];
    });
    return entries.length === 1 ? entries[0] : undefined;
};
export const renderPhraseEditor = (phraseId, instanceId, definitions, resolved, query = "") => {
    const editor = element("div", "inline-editor phrase-editor");
    editor.dataset.editorFor = resolved.key;
    editor.setAttribute("role", "group");
    editor.setAttribute("aria-label", `${resolved.title} auswählen`);
    const phrase = definitions.phrases[phraseId];
    const catalog = phrase.catalog === undefined
        ? undefined
        : definitions.catalogs[phrase.catalog];
    const appendCandidates = (parent, candidates, searchResults = false) => {
        const visible = catalog === undefined
            ? candidates
            : candidates.slice(0, CATALOG_RESULT_LIMIT);
        for (const [valueId, value] of visible) {
            const parsed = parseValue(value);
            const label = pickerValueLabel(parsed.text, phrase.attributes, definitions);
            const button = actionButton(label.text, "choose-value", scopedData({ phraseId, valueId }, instanceId), `choice choice--${parsed.kind ?? "neutral"}`);
            if (label.opensEditor)
                button.title = "Öffnet eine Eingabe";
            button.setAttribute("aria-pressed", String(resolved.included && resolved.valueId === valueId));
            parent.append(button);
        }
        if (catalog !== undefined && candidates.length > visible.length) {
            parent.append(element("span", "status catalog-picker__status", `${visible.length} von ${candidates.length}${searchResults ? " · Suche verfeinern" : ""}`));
        }
    };
    const catalogValues = Object.entries(phrase.values).filter(([, value]) => value.freeText !== true);
    const tokens = searchTokens(query);
    const freeText = Object.entries(phrase.values).find(([, value]) => value.freeText === true);
    if (catalog === undefined) {
        const textEntry = directTextEntry(catalogValues, phrase.attributes, definitions);
        appendCandidates(editor, textEntry === undefined
            ? catalogValues
            : catalogValues.filter(([valueId]) => valueId !== textEntry.valueId));
        if (textEntry !== undefined) {
            const field = element("input", "editor-input picker-entry__input");
            field.type = "text";
            field.value = query;
            field.autocomplete = "off";
            field.placeholder =
                textEntry.editor.placeholder ?? textEntry.editor.label ?? "Wert";
            field.dataset.input = "picker-query";
            field.dataset.phraseId = phraseId;
            if (instanceId !== undefined)
                field.dataset.instanceId = instanceId;
            field.setAttribute("aria-label", `${textEntry.editor.label ?? resolved.title} eingeben`);
            const accept = actionButton(query.trim() === "" ? "Übernehmen" : `„${query.trim()}“ übernehmen`, "choose-freetext", scopedData({
                phraseId,
                valueId: textEntry.valueId,
                value: query.trim(),
            }, instanceId), `choice choice--${textEntry.value.kind}`);
            accept.disabled = query.trim() === "";
            editor.append(field, accept);
        }
    }
    else {
        const selectedLens = getSymptomLens();
        const activeLens = catalog.lenses.some((lens) => lens.id === selectedLens)
            ? selectedLens
            : catalog.lenses[0]?.id;
        const recommendations = catalogValues.filter(([, value]) => catalog.lenses.length === 0
            ? true
            : value.lenses?.includes(activeLens ?? "") === true);
        const searchResults = catalogValues.filter(([, value]) => {
            const searchable = value.search ?? normaliseSearch(parseValue(value).text);
            return matchesSearchTokens(searchable, tokens);
        });
        editor.classList.add("catalog-picker");
        if (tokens.length > 0) {
            editor.classList.add("catalog-picker--searching");
        }
        const search = element("input", "editor-input catalog-picker__search");
        search.type = "search";
        search.value = query;
        search.autocomplete = "off";
        search.spellcheck = false;
        search.placeholder = `Nicht dabei? ${resolved.title} suchen oder frei eingeben …`;
        search.dataset.input = "picker-query";
        search.dataset.phraseId = phraseId;
        if (instanceId !== undefined)
            search.dataset.instanceId = instanceId;
        search.setAttribute("aria-label", `${resolved.title} suchen`);
        const recommendationList = element("div", "catalog-picker__recommendations");
        appendCandidates(recommendationList, recommendations);
        editor.append(recommendationList, search);
        const resultList = element("div", "catalog-picker__results");
        if (tokens.length > 0) {
            appendCandidates(resultList, searchResults, true);
            if (freeText !== undefined) {
                resultList.append(actionButton(`„${query.trim()}“ übernehmen`, "choose-freetext", scopedData({
                    phraseId,
                    valueId: freeText[0],
                    value: query.trim(),
                }, instanceId), "choice choice--abnormal"));
            }
        }
        editor.append(resultList);
    }
    editor.append(actionButton("− Weglassen", "exclude-phrase", scopedData({ phraseId }, instanceId)), iconActionButton("↺", "Phrase zurücksetzen", "reset-phrase", scopedData({ phraseId }, instanceId), "control"), actionButton("Fertig", "close-editor", {}, "control control--primary"));
    return editor;
};
const editorValue = (state, phraseId, attributeId, instanceId) => scopeState(state, instanceId).attributes[phraseId]?.[attributeId];
const input = (type, phraseId, attributeId, value, instanceId) => {
    const field = element("input", "editor-input");
    field.type = type;
    field.value = value;
    field.dataset.input = "attribute";
    if (value !== "")
        field.dataset.selectOnFocus = "true";
    field.dataset.phraseId = phraseId;
    field.dataset.attributeId = attributeId;
    if (instanceId !== undefined)
        field.dataset.instanceId = instanceId;
    field.setAttribute("aria-label", attributeId);
    return field;
};
const renderNumberEditor = (node, editor, phraseId, attributeId, instanceId, value) => {
    const number = typeof value === "number" ? value : (editor.default ?? 0);
    node.append(actionButton("−", "step-number", scopedData({ phraseId, attributeId, delta: String(-(editor.step ?? 1)) }, instanceId)));
    const field = input("number", phraseId, attributeId, String(number), instanceId);
    field.inputMode = "decimal";
    field.step = String(editor.step ?? 1);
    if (editor.min !== undefined)
        field.min = String(editor.min);
    if (editor.max !== undefined)
        field.max = String(editor.max);
    node.append(field);
    node.append(actionButton("+", "step-number", scopedData({ phraseId, attributeId, delta: String(editor.step ?? 1) }, instanceId)));
};
const renderDurationEditor = (node, editor, phraseId, attributeId, instanceId, value) => {
    const duration = isDurationValue(value)
        ? value
        : {
            amount: 1,
            unit: editor.defaultUnit ?? editor.units?.[0] ?? "day",
            anchor: "",
        };
    node.append(actionButton("−", "step-duration", scopedData({ phraseId, attributeId, delta: "-1" }, instanceId)));
    const field = input("number", phraseId, attributeId, String(duration.amount), instanceId);
    field.inputMode = "numeric";
    field.min = "1";
    field.step = "1";
    field.dataset.durationUnit = duration.unit;
    node.append(field);
    node.append(actionButton("+", "step-duration", scopedData({ phraseId, attributeId, delta: "1" }, instanceId)));
    const units = editor.units ?? [
        "minute",
        "hour",
        "day",
        "week",
        "month",
        "year",
    ];
    const unitLabels = {
        minute: "Minute",
        hour: "Stunde",
        day: "Tag",
        week: "Woche",
        month: "Monat",
        year: "Jahr",
    };
    const unitsNode = element("span", "editor-units");
    for (const unit of units) {
        const button = actionButton(unitLabels[unit], "choose-duration-unit", scopedData({ phraseId, attributeId, unit }, instanceId), "choice choice--neutral choice--small");
        button.setAttribute("aria-pressed", String(duration.unit === unit));
        unitsNode.append(button);
    }
    node.append(unitsNode);
};
const renderAttributeEditor = (phraseId, attributeId, instanceId, definitions, state) => {
    const editorId = definitions.phrases[phraseId].attributes?.[attributeId];
    const definition = definitions.editors[editorId ?? ""];
    const value = editorValue(state, phraseId, attributeId, instanceId);
    const node = element("span", "inline-editor attribute-editor");
    node.dataset.editorFor = phraseKey(phraseId, instanceId);
    node.setAttribute("role", "group");
    node.setAttribute("aria-label", definition.label ?? attributeId);
    if (definition.type === "choice") {
        for (const [choice, option] of Object.entries(definition.options)) {
            const parsed = parseValue(option);
            const button = actionButton(parsed.text, "choose-attribute", scopedData({ phraseId, attributeId, value: choice }, instanceId), `choice choice--${parsed.kind ?? "neutral"}`);
            button.setAttribute("aria-pressed", String(value === choice));
            node.append(button);
        }
    }
    else if (definition.type === "number") {
        renderNumberEditor(node, definition, phraseId, attributeId, instanceId, value);
    }
    else if (definition.type === "duration") {
        renderDurationEditor(node, definition, phraseId, attributeId, instanceId, value);
    }
    else if (definition.type === "date") {
        node.append(input("date", phraseId, attributeId, typeof value === "string" ? value : "", instanceId));
    }
    else if (definition.type === "datetime") {
        node.append(input("datetime-local", phraseId, attributeId, isDateTimeValue(value) ? value.local : "", instanceId));
    }
    else {
        const field = input("text", phraseId, attributeId, typeof value === "string" ? value : "", instanceId);
        field.placeholder = definition.placeholder ?? definition.label ?? "";
        node.append(field);
    }
    node.append(actionButton("Leeren", "clear-attribute", scopedData({ phraseId, attributeId }, instanceId)), actionButton("Fertig", "close-editor", {}, "control control--primary"));
    return node;
};
const renderPhrase = (parent, phraseId, instanceId, definitions, state, resolved, openEditor, highlightedSuggestions, pickerQueries) => {
    const phrase = resolved.phrases[phraseKey(phraseId, instanceId)];
    if (phrase === undefined || !phrase.visible)
        return;
    const classes = ["phrase", `phrase--${phrase.kind}`];
    if (phrase.effectiveIncluded) {
        classes.push("phrase--included");
    }
    else if (phrase.source === "suggestion") {
        classes.push("phrase--suggestion");
    }
    else {
        classes.push("phrase--available");
    }
    if (highlightedSuggestions.has(phrase.key)) {
        classes.push("phrase--new-suggestion");
    }
    if (phrase.touched)
        classes.push("phrase--touched");
    if (phrase.source === "set")
        classes.push("phrase--set");
    const phraseNode = element("span", classes.join(" "));
    phraseNode.dataset.phraseId = phraseId;
    if (instanceId !== undefined)
        phraseNode.dataset.instanceId = instanceId;
    phraseNode.title = definitions.phrases[phraseId].note ?? "";
    let renderedOpenAttribute = false;
    for (const part of phrase.parts) {
        if (part.type === "text") {
            if (part.text.trim() === "")
                continue;
            const button = actionButton(part.text, "phrase", scopedData({ phraseId }, instanceId), "phrase__part phrase__text");
            button.setAttribute("aria-pressed", String(phrase.included));
            phraseNode.append(button);
        }
        else if (!renderedOpenAttribute &&
            attributeEditorMatches(openEditor, phraseId, part.id, instanceId)) {
            phraseNode.append(renderAttributeEditor(phraseId, part.id, instanceId, definitions, state));
            renderedOpenAttribute = true;
        }
        else {
            const button = actionButton(part.text, "attribute", scopedData({ phraseId, attributeId: part.id }, instanceId), "phrase__part phrase__attribute");
            button.setAttribute("aria-label", `${part.id}: ${part.text}`);
            phraseNode.append(button);
        }
    }
    phraseNode.append(element("span", "phrase__delimiter", ";"));
    parent.append(phraseNode);
    if (editorMatches(openEditor, "phrase", phraseId, instanceId)) {
        parent.append(renderPhraseEditor(phraseId, instanceId, definitions, phrase, pickerQueries[phrase.key] ?? ""));
    }
};
const renderCompactContents = (parent, groupId, level, definitions, state, resolved, openEditor, highlightedSuggestions, compactOverrides, pickerQueries, insideAutoCompact, path, instanceId) => {
    const group = definitions.groups[groupId];
    let phraseIds = [];
    const renderPhrases = () => {
        if (phraseIds.length === 0)
            return;
        const phrases = element("div", "phrases");
        for (const phraseId of phraseIds) {
            renderPhrase(phrases, phraseId, instanceId, definitions, state, resolved, openEditor, highlightedSuggestions, pickerQueries);
        }
        parent.append(phrases);
        phraseIds = [];
    };
    for (const item of groupItems(group)) {
        if (item.type === "phrase") {
            const phrase = resolved.phrases[phraseKey(item.id, instanceId)];
            if (phrase?.effectiveIncluded === true ||
                (phrase?.visible === true && phrase.source === "suggestion")) {
                phraseIds.push(item.id);
            }
            continue;
        }
        renderPhrases();
        const childId = item.id;
        const child = definitions.groups[childId];
        if (child.repeatable !== undefined && instanceId === undefined) {
            for (const [index, childInstanceId] of (state.groupInstances[childId] ?? []).entries()) {
                renderGroup(parent, childId, level, definitions, state, resolved, openEditor, highlightedSuggestions, compactOverrides, pickerQueries, childInstanceId, index, path, insideAutoCompact);
            }
        }
        else {
            renderGroup(parent, childId, level, definitions, state, resolved, openEditor, highlightedSuggestions, compactOverrides, pickerQueries, instanceId, undefined, path, insideAutoCompact);
        }
    }
    renderPhrases();
};
const renderRepeatable = (parent, groupId, level, definitions, state, resolved, openEditor, highlightedSuggestions, compactOverrides, pickerQueries, insideAutoCompact) => {
    const group = definitions.groups[groupId];
    const container = element("div", "repeatable");
    container.dataset.repeatableGroupId = groupId;
    for (const [index, instanceId] of (state.groupInstances[groupId] ?? []).entries()) {
        renderGroup(container, groupId, level, definitions, state, resolved, openEditor, highlightedSuggestions, compactOverrides, pickerQueries, instanceId, index, undefined, insideAutoCompact);
    }
    const title = parseValue(group.title).text;
    const addLabel = group.repeatable?.add ?? `${title} hinzufügen`;
    const addButton = actionButton(title, "add-group-instance", { groupId }, `group__toggle repeatable__add repeatable__add--${group.kind ?? "neutral"}`);
    const indicator = element("span", "group__indicator", "+");
    indicator.setAttribute("aria-hidden", "true");
    addButton.append(indicator);
    addButton.setAttribute("aria-label", addLabel);
    addButton.title = addLabel;
    container.append(addButton);
    parent.append(container);
};
function renderGroup(parent, groupId, level, definitions, state, resolved, openEditor, highlightedSuggestions, compactOverrides, pickerQueries, instanceId, instanceIndex, compactPath, insideAutoCompact = false) {
    const group = definitions.groups[groupId];
    if (!isGroupConditionMet(groupId, resolved, instanceId))
        return;
    const isInstanceRoot = instanceIndex !== undefined;
    const compactSummary = compactPath !== undefined;
    const enabled = resolved.groups[phraseKey(groupId, instanceId)]?.enabled ?? false;
    const { included, suggested } = groupPhrasePresence(groupId, resolved, instanceId);
    if (compactSummary && !included && !suggested)
        return;
    const nextCompactPath = compactSummary
        ? [
            ...compactPath,
            { groupId, ...(instanceId === undefined ? {} : { instanceId }) },
        ]
        : undefined;
    const compactKey = phraseKey(groupId, instanceId);
    const compactByDefault = insideAutoCompact || group.autoCompact === true;
    const compact = compactSummary || (compactOverrides[compactKey] ?? compactByDefault);
    const section = element("section", [
        "group",
        `group--${group.kind ?? "neutral"}`,
        isInstanceRoot ? "group--instance" : "",
        !compactSummary && level === 1 ? "group--root" : "group--nested",
        `group--subgroups-${group.subgroups ?? "flow"}`,
        included ? "group--included" : "",
        enabled ? "" : "group--inactive",
        compact ? "group--compact" : "",
        compactSummary ? "group--compact-summary" : "",
    ]
        .filter(Boolean)
        .join(" "));
    section.dataset.groupId = groupId;
    if (instanceId !== undefined)
        section.dataset.instanceId = instanceId;
    const header = element("header", "group__header");
    const heading = element(`h${Math.min(6, Math.max(1, level))}`, "group__heading");
    const baseTitle = parseValue(group.title).text;
    const title = instanceIndex === undefined ? baseTitle : `${baseTitle} ${instanceIndex + 1}`;
    const headingButton = actionButton(groupHeading(title), "toggle-group", scopedData({ groupId }, instanceId), "group__toggle");
    headingButton.setAttribute("aria-pressed", String(enabled));
    headingButton.title = group.note ?? "";
    heading.append(headingButton);
    header.append(heading);
    let disclosure = null;
    if (!compactSummary) {
        const scope = scopeState(state, instanceId);
        const tools = element("div", "group__tools");
        if (!compact && group.score !== undefined) {
            tools.append(actionButton(group.score.label, "open-score", scopedData({ groupId }, instanceId), "control control--primary group__score"));
        }
        for (const setId of compact ? [] : (group.sets ?? [])) {
            const set = definitions.sets[setId];
            const button = actionButton(set.title, "toggle-set", scopedData({ setId }, instanceId), `set set--${set.kind ?? "neutral"}`);
            button.setAttribute("aria-pressed", String(scope.activeSets.includes(setId)));
            tools.append(button);
        }
        if ((group.reset === true || isInstanceRoot) && (!compact || level === 1)) {
            tools.append(level === 1 && !compact
                ? actionButton("↺ Zurücksetzen", "reset-group", scopedData({ groupId }, instanceId), "control group__reset")
                : iconActionButton("↺", "Zurücksetzen", "reset-group", scopedData({ groupId }, instanceId), "control group__reset"));
        }
        if (isInstanceRoot && instanceId !== undefined && !compact) {
            tools.append(iconActionButton("×", `${title} entfernen`, "remove-group-instance", { groupId, instanceId }, "control control--danger"));
        }
        disclosure = iconActionButton(compact ? "…" : "≪", compact ? `${title} öffnen` : `${title} kompakt anzeigen`, "toggle-compact", scopedData({ groupId }, instanceId), `control group__disclosure${level === 1 ? "" : " group__disclosure--trailing"}`);
        if (level === 1)
            tools.append(disclosure);
        if (tools.childElementCount > 0)
            header.append(tools);
    }
    section.append(header);
    if (!compact) {
        const body = element("div", "group__body");
        if (group.summary === true && instanceId === undefined) {
            const summary = element("aside", "group__summary");
            summary.append(element("strong", "group__summary-label", "Auffällig:"));
            const findings = summarizeGroup(groupId, definitions, state, resolved);
            if (findings.length === 0) {
                summary.append(element("span", "group__summary-empty", "–"));
            }
            else {
                for (const finding of findings) {
                    summary.append(element("span", `group__summary-item phrase--${finding.kind}`, `${instanceLabel(finding.instanceId, definitions, state)}${finding.text}`));
                }
            }
            body.append(summary);
        }
        if (group.content !== undefined && group.content !== "") {
            body.append(element("p", "group__content", group.content));
        }
        let phraseIds = [];
        const renderPhrases = () => {
            if (phraseIds.length === 0)
                return;
            const phrases = element("div", "phrases");
            for (const id of phraseIds) {
                renderPhrase(phrases, id, instanceId, definitions, state, resolved, openEditor, highlightedSuggestions, pickerQueries);
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
            if (definitions.groups[child].repeatable !== undefined &&
                instanceId === undefined) {
                renderRepeatable(body, child, level + 1, definitions, state, resolved, openEditor, highlightedSuggestions, compactOverrides, pickerQueries, compactByDefault);
            }
            else {
                renderGroup(body, child, level + 1, definitions, state, resolved, openEditor, highlightedSuggestions, compactOverrides, pickerQueries, instanceId, undefined, undefined, compactByDefault);
            }
        }
        renderPhrases();
        section.append(body);
    }
    else {
        if (included || suggested) {
            const body = element("div", "group__body group__body--compact-only");
            renderCompactContents(body, groupId, level + 1, definitions, state, resolved, openEditor, highlightedSuggestions, compactOverrides, pickerQueries, compactByDefault, nextCompactPath ?? [
                { groupId, ...(instanceId === undefined ? {} : { instanceId }) },
            ], instanceId);
            section.append(body);
        }
    }
    if (compactSummary && nextCompactPath !== undefined) {
        const insideAutoCompactSummary = compactPath.some((context) => definitions.groups[context.groupId]?.autoCompact === true);
        if (!insideAutoCompactSummary) {
            section.append(iconActionButton("…", `${title} öffnen`, "open-group-path", scopedData({
                groupId,
                groupPath: JSON.stringify(nextCompactPath),
            }, instanceId), "control group__disclosure group__disclosure--trailing"));
        }
    }
    else if (level > 1 && disclosure !== null) {
        section.append(disclosure);
    }
    parent.append(section);
}
export const renderModule = (parent, rootId, definitions, state, resolved, openEditor, highlightedSuggestions, compactOverrides, status, controls = true, pickerQueries = {}) => {
    parent.replaceChildren();
    parent.classList.add("textblock-module");
    parent.dataset.rootId = rootId;
    if (controls) {
        const toolbar = element("div", "toolbar");
        toolbar.append(actionButton("Text kopieren", "copy-text", { rootId }), actionButton("Daten kopieren", "copy-data", { rootId }), actionButton("↺ Zurücksetzen", "reset-group", { groupId: rootId }));
        const live = element("span", "status", status);
        live.setAttribute("role", "status");
        live.setAttribute("aria-live", "polite");
        toolbar.append(live);
        parent.append(toolbar);
    }
    const documentNode = element("article", "document");
    renderGroup(documentNode, rootId, 1, definitions, state, resolved, openEditor, highlightedSuggestions, compactOverrides, pickerQueries);
    parent.append(documentNode);
};
