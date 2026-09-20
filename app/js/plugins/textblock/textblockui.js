import { isDateTimeValue, isDurationValue, parseValue, } from "./textblocklib.js";
import { isGroupEnabled, phraseKey, scopeState, summarizeGroup, } from "./textblockstate.js";
const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className !== undefined)
        node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
};
const actionButton = (label, action, data = {}, className = "control") => {
    const button = element("button", className, label);
    button.type = "button";
    button.dataset.action = action;
    Object.assign(button.dataset, data);
    return button;
};
const scopedData = (data, instanceId) => instanceId === undefined ? data : { ...data, instanceId };
const editorMatches = (editor, type, phraseId, instanceId) => editor?.type === type &&
    editor.phraseId === phraseId &&
    editor.instanceId === instanceId;
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
const renderPhraseEditor = (phraseId, instanceId, definitions, resolved) => {
    const editor = element("div", "inline-editor phrase-editor");
    editor.dataset.editorFor = resolved.key;
    editor.setAttribute("role", "group");
    editor.setAttribute("aria-label", `${resolved.title} auswählen`);
    for (const [valueId, value] of Object.entries(definitions.phrases[phraseId].values)) {
        const parsed = parseValue(value);
        const button = actionButton(parsed.text, "choose-value", scopedData({ phraseId, valueId }, instanceId), `choice choice--${parsed.kind ?? "neutral"}`);
        button.setAttribute("aria-pressed", String(resolved.included && resolved.valueId === valueId));
        editor.append(button);
    }
    editor.append(actionButton("− Weglassen", "exclude-phrase", scopedData({ phraseId }, instanceId)), actionButton("↺ Zurücksetzen", "reset-phrase", scopedData({ phraseId }, instanceId)), actionButton("Fertig", "close-editor", {}, "control control--primary"));
    return editor;
};
const editorValue = (state, phraseId, attributeId, instanceId) => scopeState(state, instanceId).attributes[phraseId]?.[attributeId];
const input = (type, phraseId, attributeId, value, instanceId) => {
    const field = element("input", "editor-input");
    field.type = type;
    field.value = value;
    field.dataset.input = "attribute";
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
    const node = element("div", "inline-editor attribute-editor");
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
const renderPhrase = (parent, phraseId, instanceId, definitions, state, resolved, openEditor) => {
    const phrase = resolved.phrases[phraseKey(phraseId, instanceId)];
    if (phrase === undefined || !phrase.visible)
        return;
    const classes = ["phrase", `phrase--${phrase.kind}`];
    if (!phrase.included)
        classes.push("phrase--suggestion");
    if (phrase.touched)
        classes.push("phrase--touched");
    if (phrase.source === "set")
        classes.push("phrase--set");
    const phraseNode = element("span", classes.join(" "));
    phraseNode.dataset.phraseId = phraseId;
    if (instanceId !== undefined)
        phraseNode.dataset.instanceId = instanceId;
    phraseNode.title = definitions.phrases[phraseId].note ?? "";
    for (const part of phrase.parts) {
        if (part.type === "text") {
            if (part.text.trim() === "")
                continue;
            const button = actionButton(part.text, "phrase", scopedData({ phraseId }, instanceId), "phrase__part phrase__text");
            button.setAttribute("aria-pressed", String(phrase.included));
            phraseNode.append(button);
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
        parent.append(renderPhraseEditor(phraseId, instanceId, definitions, phrase));
    }
    else if (editorMatches(openEditor, "attribute", phraseId, instanceId)) {
        const attributeEditor = openEditor;
        parent.append(renderAttributeEditor(phraseId, attributeEditor.attributeId, instanceId, definitions, state));
    }
};
const renderRepeatable = (parent, groupId, level, definitions, state, resolved, openEditor, collapseOverrides) => {
    const group = definitions.groups[groupId];
    const container = element("div", "repeatable");
    container.dataset.repeatableGroupId = groupId;
    for (const [index, instanceId] of (state.groupInstances[groupId] ?? []).entries()) {
        renderGroup(container, groupId, level, definitions, state, resolved, openEditor, collapseOverrides, instanceId, index);
    }
    container.append(actionButton(group.repeatable?.add ?? `${parseValue(group.title).text} hinzufügen`, "add-group-instance", { groupId }, `control repeatable__add repeatable__add--${group.kind ?? "neutral"}`));
    parent.append(container);
};
function renderGroup(parent, groupId, level, definitions, state, resolved, openEditor, collapseOverrides, instanceId, instanceIndex) {
    const group = definitions.groups[groupId];
    const enabled = isGroupEnabled(groupId, definitions, state, instanceId);
    const collapsible = group.collapsed !== undefined;
    const collapsed = collapseOverrides[phraseKey(groupId, instanceId)] ??
        group.collapsed ??
        false;
    const section = element("section", [
        "group",
        `group--${group.kind ?? "neutral"}`,
        instanceId === undefined ? "" : "group--instance",
        enabled ? "" : "group--inactive",
        collapsed ? "group--collapsed" : "",
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
    const headingButton = actionButton(title, collapsible ? "toggle-collapse" : "toggle-group", scopedData({ groupId }, instanceId), "group__toggle");
    headingButton.setAttribute("aria-expanded", String(collapsible ? !collapsed : enabled));
    headingButton.title = group.note ?? "";
    heading.append(headingButton);
    header.append(heading);
    const scope = scopeState(state, instanceId);
    const tools = element("div", "group__tools");
    for (const setId of group.sets ?? []) {
        const set = definitions.sets[setId];
        const button = actionButton(set.title, "toggle-set", scopedData({ setId }, instanceId), `set set--${set.kind ?? "neutral"}`);
        button.setAttribute("aria-pressed", String(scope.activeSets.includes(setId)));
        tools.append(button);
    }
    if (group.reset === true || instanceId !== undefined) {
        tools.append(actionButton("↺ Zurücksetzen", "reset-group", scopedData({ groupId }, instanceId), "control group__reset"));
    }
    if (instanceId !== undefined) {
        tools.append(actionButton("Entfernen", "remove-group-instance", { groupId, instanceId }, "control control--danger"));
    }
    if (tools.childElementCount > 0)
        header.append(tools);
    section.append(header);
    if (enabled && !collapsed) {
        const hasCollapsibleChildren = (group.children ?? []).some((childId) => definitions.groups[childId].collapsed !== undefined);
        const body = element("div", hasCollapsibleChildren
            ? "group__body group__body--collapsible-children"
            : "group__body");
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
        if ((group.phrases ?? []).length > 0) {
            const phrases = element("div", "phrases");
            for (const phraseId of group.phrases ?? []) {
                renderPhrase(phrases, phraseId, instanceId, definitions, state, resolved, openEditor);
            }
            body.append(phrases);
        }
        for (const child of group.children ?? []) {
            if (definitions.groups[child].repeatable !== undefined &&
                instanceId === undefined) {
                renderRepeatable(body, child, level + 1, definitions, state, resolved, openEditor, collapseOverrides);
            }
            else {
                renderGroup(body, child, level + 1, definitions, state, resolved, openEditor, collapseOverrides, instanceId);
            }
        }
        section.append(body);
    }
    parent.append(section);
}
export const renderModule = (parent, rootId, definitions, state, resolved, openEditor, collapseOverrides, status, controls = true) => {
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
    renderGroup(documentNode, rootId, 1, definitions, state, resolved, openEditor, collapseOverrides);
    parent.append(documentNode);
};
