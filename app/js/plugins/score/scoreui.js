const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className !== undefined)
        node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
};
const actionButton = (label, action, data = {}, className = "control") => {
    const node = element("button", className, label);
    node.type = "button";
    node.dataset.action = action;
    for (const [key, value] of Object.entries(data))
        node.dataset[key] = value;
    return node;
};
export const scoreTotal = (module) => {
    let total = 0;
    for (const criterion of module.score.criteria) {
        const selected = module.selected[criterion.phraseId];
        const option = criterion.options.find((candidate) => candidate.valueId === selected);
        if (option === undefined)
            return null;
        total += option.points;
    }
    return total;
};
export const renderModule = (parent, module) => {
    const article = element("article", "document score-module");
    article.append(element("p", "group__content", "Alle Kriterien auswählen. Mit Übernehmen werden Kriterien und Gesamtwert als aktive Einträge in den Textbaustein übernommen."));
    for (const criterion of module.score.criteria) {
        const fieldset = element("fieldset", "score-criterion");
        fieldset.append(element("legend", "score-criterion__title", criterion.title));
        const choices = element("div", "score-criterion__choices");
        for (const option of criterion.options) {
            const button = actionButton(`${option.text} · ${option.points}`, "choose-score", {
                phraseId: criterion.phraseId,
                valueId: option.valueId,
            }, `choice choice--${option.kind} score-option`);
            button.setAttribute("aria-pressed", String(module.selected[criterion.phraseId] === option.valueId));
            choices.append(button);
        }
        fieldset.append(choices);
        article.append(fieldset);
    }
    const total = scoreTotal(module);
    const result = element("section", "score-result");
    const output = element("output", "score-result__value", total === null ? "Gesamt: –" : `Gesamt: ${total}`);
    output.setAttribute("aria-live", "polite");
    const apply = actionButton("In Textbaustein übernehmen", "apply-score", {}, "control control--primary");
    apply.disabled = total === null;
    result.append(output, apply);
    if (module.status !== "") {
        const status = element("span", "status", module.status);
        status.setAttribute("role", "status");
        result.append(status);
    }
    article.append(result);
    parent.replaceChildren(article);
};
