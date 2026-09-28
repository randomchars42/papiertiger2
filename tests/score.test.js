import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
    applyScoreRules,
    calculateScore,
    effectiveScoreSelections,
} from "../app/js/plugins/score/scorelib.js";

const option = (valueId, points) => ({
    valueId,
    text: valueId,
    kind: points === 0 ? "normal" : "abnormal",
    points,
});

const comaScore = {
    id: "test",
    label: "Test",
    minimum: 0,
    maximum: 8,
    criteria: [
        {
            phraseId: "consciousness",
            title: "Consciousness",
            options: [option("awake", 0), option("coma", 3)],
        },
        {
            phraseId: "sensory",
            title: "Sensory",
            options: [option("sensory-normal", 0), option("sensory-coma", 2)],
        },
        {
            phraseId: "language",
            title: "Language",
            options: [option("language-normal", 0), option("language-coma", 3)],
        },
    ],
    rules: [
        {
            when: { phraseId: "consciousness", valueId: "coma" },
            set: [
                { phraseId: "sensory", valueId: "sensory-coma" },
                { phraseId: "language", valueId: "language-coma" },
            ],
        },
    ],
    target: { phraseId: "total", valueId: "total-value", attributeId: "value" },
};

test("score rules replace manual targets with derived selections", () => {
    const ruled = applyScoreRules(comaScore, {
        consciousness: "coma",
        sensory: "sensory-normal",
        language: "language-normal",
    });

    assert.deepEqual(ruled.selected, { consciousness: "coma" });
    assert.deepEqual(effectiveScoreSelections(ruled.selected, ruled.derived), {
        consciousness: "coma",
        sensory: "sensory-coma",
        language: "language-coma",
    });
    assert.deepEqual(calculateScore(comaScore, ruled.selected, ruled.derived), {
        kind: "total",
        completed: 3,
        total: 8,
        unavailablePhraseIds: [],
    });
});

test("removing a score-rule trigger leaves its former targets incomplete", () => {
    const ruled = applyScoreRules(comaScore, { consciousness: "awake" });

    assert.deepEqual(ruled.derived, {});
    assert.deepEqual(calculateScore(comaScore, ruled.selected, ruled.derived), {
        kind: "incomplete",
        completed: 1,
    });
});

test("an UN option completes the criteria, is retained, and contributes zero", () => {
    const score = {
        ...comaScore,
        criteria: [
            {
                phraseId: "motor",
                title: "Motor",
                options: [option("normal", 0), option("untestable", "UN")],
            },
        ],
        rules: [],
    };

    assert.deepEqual(calculateScore(score, { motor: "untestable" }, {}), {
        kind: "total",
        completed: 1,
        total: 0,
        unavailablePhraseIds: ["motor"],
    });
});

test("compiled NIHSS contains 15 criteria, the coma rule, and a 0-42 range", async () => {
    const packageDefinition = JSON.parse(
        await readFile(new URL("../app/data/nihss.json", import.meta.url), "utf8"),
    );
    const score = packageDefinition.groups.nihss.score;

    assert.equal(score.criteria.length, 15);
    assert.equal(score.minimum, 0);
    assert.equal(score.maximum, 42);
    assert.equal(score.rules.length, 1);
    assert.equal(score.rules[0].set.length, 2);
    assert.equal(
        score.criteria.flatMap((criterion) => criterion.options).filter(
            (candidate) => candidate.points === "UN",
        ).length,
        6,
    );
});
