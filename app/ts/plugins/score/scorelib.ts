import type {
    DerivedScoreSelection,
    ScoreCalculation,
    ScoreDefinition,
} from "./scoretypes.js";

export const applyScoreRules = (
    score: ScoreDefinition,
    selected: Record<string, string>,
): {
    selected: Record<string, string>;
    derived: Record<string, DerivedScoreSelection>;
} => {
    const explicit = { ...selected };
    const derived: Record<string, DerivedScoreSelection> = {};
    for (const rule of score.rules ?? []) {
        if (explicit[rule.when.phraseId] !== rule.when.valueId) continue;
        for (const assignment of rule.set) {
            const prior = derived[assignment.phraseId];
            if (prior !== undefined && prior.valueId !== assignment.valueId) {
                throw new Error("Widersprüchliche Score-Regeln.");
            }
            delete explicit[assignment.phraseId];
            derived[assignment.phraseId] = {
                valueId: assignment.valueId,
                triggerPhraseId: rule.when.phraseId,
                triggerValueId: rule.when.valueId,
            };
        }
    }
    return { selected: explicit, derived };
};

export const effectiveScoreSelections = (
    selected: Record<string, string>,
    derived: Record<string, DerivedScoreSelection>,
): Record<string, string> => ({
    ...selected,
    ...Object.fromEntries(
        Object.entries(derived).map(([phraseId, selection]) => [
            phraseId,
            selection.valueId,
        ]),
    ),
});

export const calculateScore = (
    score: ScoreDefinition,
    selected: Record<string, string>,
    derived: Record<string, DerivedScoreSelection>,
): ScoreCalculation => {
    const effective = effectiveScoreSelections(selected, derived);
    let total = 0;
    let completed = 0;
    const unavailablePhraseIds: string[] = [];
    for (const criterion of score.criteria) {
        const valueId = effective[criterion.phraseId];
        const option = criterion.options.find(
            (candidate) => candidate.valueId === valueId,
        );
        if (option === undefined) continue;
        completed += 1;
        if (option.points === "UN") unavailablePhraseIds.push(criterion.phraseId);
        else total += option.points;
    }
    if (completed !== score.criteria.length) return { kind: "incomplete", completed };
    return { kind: "total", completed, total, unavailablePhraseIds };
};
