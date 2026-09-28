import type { ScoreModuleState } from "./scoretypes.js";
import { actionButton, element } from "@lib/dom.js";
import { calculateScore, effectiveScoreSelections } from "./scorelib.js";

export const scoreTotal = (module: ScoreModuleState): number | null => {
    const calculation = calculateScore(
        module.score,
        module.selected,
        module.derived,
    );
    return calculation.kind === "total" ? calculation.total : null;
};

export const renderModule = (
    parent: HTMLElement,
    module: ScoreModuleState,
): void => {
    const article = element("article", "document score-module");
    article.append(
        element(
            "p",
            "group__content",
            "Alle Kriterien auswählen. Mit Übernehmen werden die Kriterien und der Gesamtwert als aktive Einträge in den Textbaustein übernommen. UN bleibt dokumentiert und zählt für die Summe als 0.",
        ),
    );

    const calculation = calculateScore(
        module.score,
        module.selected,
        module.derived,
    );
    const progress = element(
        "p",
        "score-progress",
        `${calculation.completed} von ${module.score.criteria.length} Kriterien ausgewählt`,
    );
    progress.setAttribute("role", "status");
    article.append(progress);
    const effective = effectiveScoreSelections(module.selected, module.derived);

    for (const criterion of module.score.criteria) {
        const fieldset = element("fieldset", "score-criterion");
        fieldset.append(element("legend", "score-criterion__title", criterion.title));
        const choices = element("div", "score-criterion__choices");
        const derived = module.derived[criterion.phraseId];
        for (const option of criterion.options) {
            const ruleNote =
                derived?.valueId === option.valueId
                    ? ` · automatisch aus ${
                          module.score.criteria.find(
                              (candidate) =>
                                  candidate.phraseId === derived.triggerPhraseId,
                          )?.title ?? "Score-Regel"
                      }`
                    : "";
            const button = actionButton(
                `${option.text} · ${option.points}${ruleNote}`,
                "choose-score",
                {
                    phraseId: criterion.phraseId,
                    valueId: option.valueId,
                },
                `choice choice--${option.kind} score-option`,
            );
            button.setAttribute(
                "aria-pressed",
                String(effective[criterion.phraseId] === option.valueId),
            );
            button.disabled = derived !== undefined;
            choices.append(button);
        }
        fieldset.append(choices);
        article.append(fieldset);
    }

    const result = element("section", "score-result");
    const resultText =
        calculation.kind === "total"
            ? `Gesamt: ${calculation.total}${
                  calculation.unavailablePhraseIds.length > 0
                      ? " (UN als 0 gewertet)"
                      : ""
              }`
            : "Gesamt: –";
    const output = element(
        "output",
        "score-result__value",
        resultText,
    );
    output.setAttribute("aria-live", "polite");
    const apply = actionButton(
        "In Textbaustein übernehmen",
        "apply-score",
        {},
        "control control--primary",
    );
    apply.disabled = calculation.kind === "incomplete";
    result.append(output, apply);
    if (module.status !== "") {
        const status = element("span", "status", module.status);
        status.setAttribute("role", "status");
        result.append(status);
    }
    article.append(result);
    parent.replaceChildren(article);
};
