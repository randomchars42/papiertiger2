import { isDurationValue, parseValue } from "./textblocklib.js";
import { isGroupEnabled, summarizeGroup } from "./textblockstate.js";
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
    | { type: "phrase"; phraseId: string }
    | { type: "attribute"; phraseId: string; attributeId: string }
    | null;

const element = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (className !== undefined) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
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

const renderPhraseEditor = (
    phraseId: string,
    definitions: Definitions,
    resolved: ResolvedPhrase,
): HTMLElement => {
    const editor = element("div", "inline-editor phrase-editor");
    editor.dataset.editorFor = phraseId;
    editor.setAttribute("role", "group");
    editor.setAttribute("aria-label", `${resolved.title} auswählen`);

    for (const [valueId, value] of Object.entries(
        definitions.phrases[phraseId].values,
    )) {
        const parsed = parseValue(value);
        const button = actionButton(
            parsed.text,
            "choose-value",
            { phraseId, valueId },
            `choice choice--${parsed.kind ?? "neutral"}`,
        );
        button.setAttribute(
            "aria-pressed",
            String(resolved.included && resolved.valueId === valueId),
        );
        editor.append(button);
    }

    editor.append(
        actionButton("Nicht aufnehmen", "exclude-phrase", { phraseId }),
        actionButton("Automatisch", "reset-phrase", { phraseId }),
        actionButton("Fertig", "close-editor", {}, "control control--primary"),
    );
    return editor;
};

const editorValue = (
    state: DocumentState,
    phraseId: string,
    attributeId: string,
): AttributeValue | undefined => state.attributes[phraseId]?.[attributeId];

const input = (
    type: string,
    phraseId: string,
    attributeId: string,
    value: string,
): HTMLInputElement => {
    const field = element("input", "editor-input");
    field.type = type;
    field.value = value;
    field.dataset.input = "attribute";
    field.dataset.phraseId = phraseId;
    field.dataset.attributeId = attributeId;
    field.setAttribute("aria-label", attributeId);
    return field;
};

const renderNumberEditor = (
    node: HTMLElement,
    editor: Extract<EditorDefinition, { type: "number" }>,
    phraseId: string,
    attributeId: string,
    value?: AttributeValue,
): void => {
    const number = typeof value === "number" ? value : (editor.default ?? 0);
    node.append(
        actionButton("−", "step-number", {
            phraseId,
            attributeId,
            delta: String(-(editor.step ?? 1)),
        }),
    );
    const field = input("number", phraseId, attributeId, String(number));
    field.inputMode = "decimal";
    field.step = String(editor.step ?? 1);
    if (editor.min !== undefined) field.min = String(editor.min);
    if (editor.max !== undefined) field.max = String(editor.max);
    node.append(field);
    node.append(
        actionButton("+", "step-number", {
            phraseId,
            attributeId,
            delta: String(editor.step ?? 1),
        }),
    );
};

const renderDurationEditor = (
    node: HTMLElement,
    editor: Extract<EditorDefinition, { type: "duration" }>,
    phraseId: string,
    attributeId: string,
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
        actionButton("−", "step-duration", {
            phraseId,
            attributeId,
            delta: "-1",
        }),
    );
    const field = input(
        "number",
        phraseId,
        attributeId,
        String(duration.amount),
    );
    field.inputMode = "numeric";
    field.min = "1";
    field.step = "1";
    field.dataset.durationUnit = duration.unit;
    node.append(field);
    node.append(
        actionButton("+", "step-duration", {
            phraseId,
            attributeId,
            delta: "1",
        }),
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
            { phraseId, attributeId, unit },
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
    definitions: Definitions,
    state: DocumentState,
): HTMLElement => {
    const editorId = definitions.phrases[phraseId].attributes?.[attributeId];
    const definition = definitions.editors[editorId ?? ""];
    const value = editorValue(state, phraseId, attributeId);
    const node = element("div", "inline-editor attribute-editor");
    node.dataset.editorFor = `${phraseId}:${attributeId}`;
    node.setAttribute("role", "group");
    node.setAttribute("aria-label", definition.label ?? attributeId);

    if (definition.type === "choice") {
        for (const [choice, option] of Object.entries(definition.options)) {
            const parsed = parseValue(option);
            const button = actionButton(
                parsed.text,
                "choose-attribute",
                { phraseId, attributeId, value: choice },
                `choice choice--${parsed.kind ?? "neutral"}`,
            );
            button.setAttribute("aria-pressed", String(value === choice));
            node.append(button);
        }
    } else if (definition.type === "number") {
        renderNumberEditor(node, definition, phraseId, attributeId, value);
    } else if (definition.type === "duration") {
        renderDurationEditor(node, definition, phraseId, attributeId, value);
    } else if (definition.type === "date") {
        node.append(
            input(
                "date",
                phraseId,
                attributeId,
                typeof value === "string" ? value : "",
            ),
        );
    } else {
        const field = input(
            "text",
            phraseId,
            attributeId,
            typeof value === "string" ? value : "",
        );
        field.placeholder = definition.placeholder ?? definition.label ?? "";
        node.append(field);
    }

    node.append(
        actionButton("Leeren", "clear-attribute", { phraseId, attributeId }),
        actionButton("Fertig", "close-editor", {}, "control control--primary"),
    );
    return node;
};

const renderPhrase = (
    parent: HTMLElement,
    phraseId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    openEditor: OpenEditor,
): void => {
    const phrase = resolved.phrases[phraseId];
    if (!phrase.visible) {
        return;
    }

    const classes = ["phrase", `phrase--${phrase.kind}`];
    if (!phrase.included) classes.push("phrase--suggestion");
    if (phrase.touched) classes.push("phrase--touched");
    if (phrase.source === "set") classes.push("phrase--set");
    const phraseNode = element("span", classes.join(" "));
    phraseNode.dataset.phraseId = phraseId;
    phraseNode.title = definitions.phrases[phraseId].note ?? "";

    for (const part of phrase.parts) {
        if (part.type === "text") {
            if (part.text === "") continue;
            const button = actionButton(
                part.text,
                "phrase",
                { phraseId },
                "phrase__part phrase__text",
            );
            button.setAttribute("aria-pressed", String(phrase.included));
            phraseNode.append(button);
        } else {
            const button = actionButton(
                part.text,
                "attribute",
                { phraseId, attributeId: part.id },
                "phrase__part phrase__attribute",
            );
            button.setAttribute("aria-label", `${part.id}: ${part.text}`);
            phraseNode.append(button);
        }
    }
    phraseNode.append(element("span", "phrase__delimiter", ";"));
    parent.append(phraseNode);

    if (openEditor?.type === "phrase" && openEditor.phraseId === phraseId) {
        parent.append(renderPhraseEditor(phraseId, definitions, phrase));
    } else if (
        openEditor?.type === "attribute" &&
        openEditor.phraseId === phraseId
    ) {
        parent.append(
            renderAttributeEditor(
                phraseId,
                openEditor.attributeId,
                definitions,
                state,
            ),
        );
    }
};

const renderGroup = (
    parent: HTMLElement,
    groupId: string,
    level: number,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    openEditor: OpenEditor,
): void => {
    const group = definitions.groups[groupId];
    const enabled = isGroupEnabled(groupId, definitions, state);
    const section = element(
        "section",
        [
            "group",
            `group--${group.kind ?? "neutral"}`,
            enabled ? "" : "group--inactive",
        ]
            .filter(Boolean)
            .join(" "),
    );
    section.dataset.groupId = groupId;

    const header = element("header", "group__header");
    const heading = element(
        `h${Math.min(6, Math.max(1, level))}` as keyof HTMLElementTagNameMap,
        "group__heading",
    );
    const headingButton = actionButton(
        parseValue(group.title).text,
        "toggle-group",
        { groupId },
        "group__toggle",
    );
    headingButton.setAttribute("aria-expanded", String(enabled));
    headingButton.title = group.note ?? "";
    heading.append(headingButton);
    header.append(heading);

    const tools = element("div", "group__tools");
    for (const setId of group.sets ?? []) {
        const set = definitions.sets[setId];
        const button = actionButton(
            set.title,
            "toggle-set",
            { setId },
            `set set--${set.kind ?? "neutral"}`,
        );
        button.setAttribute(
            "aria-pressed",
            String(state.activeSets.includes(setId)),
        );
        tools.append(button);
    }
    if (group.reset === true) {
        tools.append(
            actionButton(
                "Zurücksetzen",
                "reset-group",
                { groupId },
                "control group__reset",
            ),
        );
    }
    if (tools.childElementCount > 0) {
        header.append(tools);
    }
    section.append(header);

    if (enabled) {
        const body = element("div", "group__body");
        if (group.summary === true) {
            const summary = element("aside", "group__summary");
            summary.append(element("strong", "group__summary-label", "Auffällig:"));
            const findings = summarizeGroup(
                groupId,
                definitions,
                state,
                resolved,
            );
            if (findings.length === 0) {
                summary.append(element("span", "group__summary-empty", "–"));
            } else {
                for (const finding of findings) {
                    summary.append(
                        element(
                            "span",
                            `group__summary-item phrase--${finding.kind}`,
                            finding.text,
                        ),
                    );
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
                renderPhrase(
                    phrases,
                    phraseId,
                    definitions,
                    state,
                    resolved,
                    openEditor,
                );
            }
            body.append(phrases);
        }
        for (const child of group.children ?? []) {
            renderGroup(
                body,
                child,
                level + 1,
                definitions,
                state,
                resolved,
                openEditor,
            );
        }
        section.append(body);
    }
    parent.append(section);
};

export const renderModule = (
    parent: HTMLElement,
    rootId: string,
    definitions: Definitions,
    state: DocumentState,
    resolved: ResolvedDocument,
    openEditor: OpenEditor,
    status: string,
): void => {
    parent.replaceChildren();
    parent.classList.add("textblock-module");
    parent.dataset.rootId = rootId;

    const toolbar = element("div", "toolbar");
    toolbar.append(
        actionButton("Text kopieren", "copy-text", { rootId }),
        actionButton("Daten kopieren", "copy-data", { rootId }),
        actionButton("Zurücksetzen", "reset-group", { groupId: rootId }),
    );
    const live = element("span", "status", status);
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    toolbar.append(live);
    parent.append(toolbar);

    const documentNode = element("article", "document");
    renderGroup(
        documentNode,
        rootId,
        1,
        definitions,
        state,
        resolved,
        openEditor,
    );
    parent.append(documentNode);
};
