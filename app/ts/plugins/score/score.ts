import { renderModule } from "./scoreui.js";
import { isRecord } from "@lib/guards.js";
import {
    applyScoreRules,
    calculateScore,
    effectiveScoreSelections,
} from "./scorelib.js";
import type {
    ScoreCriterion,
    ScoreDefinition,
    ScoreModuleState,
    ScoreOption,
    ScoreRule,
    ScoreRuleSelection,
} from "./scoretypes.js";

const modules = new Map<string, ScoreModuleState>();

const isOption = (value: unknown): value is ScoreOption =>
    isRecord(value) &&
    typeof value.valueId === "string" &&
    typeof value.text === "string" &&
    typeof value.kind === "string" &&
    ((typeof value.points === "number" && Number.isFinite(value.points)) ||
        value.points === "UN");

const isCriterion = (value: unknown): value is ScoreCriterion =>
    isRecord(value) &&
    typeof value.phraseId === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.options) &&
    value.options.length > 0 &&
    value.options.every(isOption);

const isRuleSelection = (value: unknown): value is ScoreRuleSelection =>
    isRecord(value) &&
    typeof value.phraseId === "string" &&
    typeof value.valueId === "string";

const isRule = (value: unknown): value is ScoreRule =>
    isRecord(value) &&
    isRuleSelection(value.when) &&
    Array.isArray(value.set) &&
    value.set.length > 0 &&
    value.set.every(isRuleSelection);

const isScore = (value: unknown): value is ScoreDefinition =>
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.minimum === "number" &&
    typeof value.maximum === "number" &&
    Array.isArray(value.criteria) &&
    value.criteria.length > 0 &&
    value.criteria.every(isCriterion) &&
    (value.rules === undefined ||
        (Array.isArray(value.rules) && value.rules.every(isRule))) &&
    isRecord(value.target) &&
    typeof value.target.phraseId === "string" &&
    typeof value.target.valueId === "string" &&
    typeof value.target.attributeId === "string";

const selectedValues = (
    value: unknown,
    score: ScoreDefinition,
): Record<string, string> => {
    if (!isRecord(value)) return {};
    return Object.fromEntries(
        score.criteria.flatMap((criterion) => {
            const selected = value[criterion.phraseId];
            return typeof selected === "string" &&
                criterion.options.some((option) => option.valueId === selected)
                ? [[criterion.phraseId, selected]]
                : [];
        }),
    );
};

const handleClick = (module: ScoreModuleState, event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("button[data-action]");
    const parent = document.getElementById(module.parentId);
    if (button === null || parent === null || !parent.contains(button)) return;

    if (button.dataset.action === "choose-score") {
        const phraseId = button.dataset.phraseId;
        const valueId = button.dataset.valueId;
        if (phraseId === undefined || valueId === undefined) return;
        const criterion = module.score.criteria.find(
            (candidate) => candidate.phraseId === phraseId,
        );
        if (
            module.derived[phraseId] !== undefined ||
            !criterion?.options.some((option) => option.valueId === valueId)
        ) {
            return;
        }
        module.selected[phraseId] = valueId;
        const ruled = applyScoreRules(module.score, module.selected);
        module.selected = ruled.selected;
        module.derived = ruled.derived;
        module.status = "";
        renderModule(parent, module);
        return;
    }

    if (button.dataset.action !== "apply-score") return;
    const calculation = calculateScore(
        module.score,
        module.selected,
        module.derived,
    );
    if (calculation.kind === "incomplete") return;
    const effective = effectiveScoreSelections(module.selected, module.derived);
    parent.dispatchEvent(
        new CustomEvent("papiertiger:plugin-message", {
            bubbles: true,
            detail: {
                type: "score-result",
                payload: {
                    groupId: module.groupId,
                    ...(module.instanceId === undefined
                        ? {}
                        : { instanceId: module.instanceId }),
                    selections: module.score.criteria.map((criterion) => ({
                        phraseId: criterion.phraseId,
                        valueId: effective[criterion.phraseId],
                    })),
                },
            },
        }),
    );
    module.status = `${calculation.total} übernommen${
        calculation.unavailablePhraseIds.length > 0
            ? "; UN als 0 gewertet"
            : ""
    }`;
    renderModule(parent, module);
};

export const display = async (
    parentId: string,
    params: Record<string, unknown>,
): Promise<void> => {
    const parent = document.getElementById(parentId);
    if (parent === null) throw new Error(`Parent "${parentId}" was not found`);
    if (!isScore(params.score) || typeof params.groupId !== "string") {
        throw new Error("Die Score-Definition ist ungültig.");
    }
    if (params.instanceId !== undefined && typeof params.instanceId !== "string") {
        throw new Error("Die Score-Instanz ist ungültig.");
    }

    const initial = applyScoreRules(
        params.score,
        selectedValues(params.selected, params.score),
    );
    const module: ScoreModuleState = {
        parentId,
        groupId: params.groupId,
        ...(params.instanceId === undefined
            ? {}
            : { instanceId: params.instanceId }),
        score: params.score,
        selected: initial.selected,
        derived: initial.derived,
        status: "",
    };
    modules.set(parentId, module);
    parent.addEventListener("click", (event) => handleClick(module, event));
    renderModule(parent, module);
};

export const dispose = (parentId: string): void => {
    modules.delete(parentId);
};
