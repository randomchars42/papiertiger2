import { renderModule } from "./scoreui.js";
import { isRecord } from "@lib/guards.js";
import { applyScoreRules, calculateScore, effectiveScoreSelections, } from "./scorelib.js";
const modules = new Map();
const isOption = (value) => isRecord(value) &&
    typeof value.valueId === "string" &&
    typeof value.text === "string" &&
    typeof value.kind === "string" &&
    ((typeof value.points === "number" && Number.isFinite(value.points)) ||
        value.points === "UN");
const isCriterion = (value) => isRecord(value) &&
    typeof value.phraseId === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.options) &&
    value.options.length > 0 &&
    value.options.every(isOption);
const isRuleSelection = (value) => isRecord(value) &&
    typeof value.phraseId === "string" &&
    typeof value.valueId === "string";
const isRule = (value) => isRecord(value) &&
    isRuleSelection(value.when) &&
    Array.isArray(value.set) &&
    value.set.length > 0 &&
    value.set.every(isRuleSelection);
const isScore = (value) => isRecord(value) &&
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
const selectedValues = (value, score) => {
    if (!isRecord(value))
        return {};
    return Object.fromEntries(score.criteria.flatMap((criterion) => {
        const selected = value[criterion.phraseId];
        return typeof selected === "string" &&
            criterion.options.some((option) => option.valueId === selected)
            ? [[criterion.phraseId, selected]]
            : [];
    }));
};
const handleClick = (module, event) => {
    const target = event.target;
    if (!(target instanceof Element))
        return;
    const button = target.closest("button[data-action]");
    const parent = document.getElementById(module.parentId);
    if (button === null || parent === null || !parent.contains(button))
        return;
    if (button.dataset.action === "choose-score") {
        const phraseId = button.dataset.phraseId;
        const valueId = button.dataset.valueId;
        if (phraseId === undefined || valueId === undefined)
            return;
        const criterion = module.score.criteria.find((candidate) => candidate.phraseId === phraseId);
        if (module.derived[phraseId] !== undefined ||
            !criterion?.options.some((option) => option.valueId === valueId)) {
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
    if (button.dataset.action !== "apply-score")
        return;
    const calculation = calculateScore(module.score, module.selected, module.derived);
    if (calculation.kind === "incomplete")
        return;
    const effective = effectiveScoreSelections(module.selected, module.derived);
    parent.dispatchEvent(new CustomEvent("papiertiger:plugin-message", {
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
    }));
    module.status = `${calculation.total} übernommen${calculation.unavailablePhraseIds.length > 0
        ? "; UN als 0 gewertet"
        : ""}`;
    renderModule(parent, module);
};
export const display = async (parentId, params) => {
    const parent = document.getElementById(parentId);
    if (parent === null)
        throw new Error(`Parent "${parentId}" was not found`);
    if (!isScore(params.score) || typeof params.groupId !== "string") {
        throw new Error("Die Score-Definition ist ungültig.");
    }
    if (params.instanceId !== undefined && typeof params.instanceId !== "string") {
        throw new Error("Die Score-Instanz ist ungültig.");
    }
    const initial = applyScoreRules(params.score, selectedValues(params.selected, params.score));
    const module = {
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
export const dispose = (parentId) => {
    modules.delete(parentId);
};
