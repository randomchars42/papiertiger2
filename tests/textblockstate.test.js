import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
    createDocumentState,
    createScopeState,
    resolveDocument,
} from "../app/js/plugins/textblock/textblockstate.js";

const value = (text) => ({ text, kind: "neutral" });

const phrase = (title, defaultValue, values, extra = {}) => ({
    title,
    default: defaultValue,
    values,
    ...extra,
});

const definitions = (groups, phrases) => ({
    groups,
    phrases,
    sets: {},
    editors: {},
    catalogs: {},
});

test("suggestions remain excluded while their group is revealed", () => {
    const model = definitions(
        {
            root: {
                title: "Root",
                items: [
                    { type: "phrase", id: "trigger" },
                    { type: "group", id: "details" },
                ],
            },
            details: {
                title: "Details",
                items: [{ type: "phrase", id: "suggested" }],
            },
        },
        {
            trigger: phrase("Trigger", null, { active: value("active") }),
            suggested: phrase(
                "Suggested",
                null,
                { option: value("option") },
                { suggestions: { active: "option" } },
            ),
        },
    );
    const state = createDocumentState();
    state.phraseOverrides.trigger = { valueId: "active", included: true };

    const resolved = resolveDocument(model, state);

    assert.equal(resolved.phrases.suggested.source, "suggestion");
    assert.equal(resolved.phrases.suggested.effectiveIncluded, false);
    assert.deepEqual(resolved.groups.details, {
        conditionMet: true,
        included: false,
        suggested: true,
    });
});

test("an inactive group suppresses effective child inclusion", () => {
    const model = definitions(
        {
            root: {
                title: "Root",
                items: [{ type: "group", id: "inactive" }],
            },
            inactive: {
                title: "Inactive",
                default: false,
                items: [{ type: "phrase", id: "finding" }],
            },
        },
        {
            finding: phrase("Finding", "present", {
                present: value("present"),
            }),
        },
    );

    const resolved = resolveDocument(model, createDocumentState());

    assert.equal(resolved.phrases.finding.included, true);
    assert.equal(resolved.phrases.finding.effectiveIncluded, false);
    assert.equal(resolved.groups.inactive.included, false);
    assert.equal(resolved.groups.root.included, false);
});

test("a matching conditional group is suggested but not included", () => {
    const model = definitions(
        {
            root: {
                title: "Root",
                items: [
                    { type: "phrase", id: "trigger" },
                    { type: "group", id: "conditional" },
                ],
            },
            conditional: {
                title: "Conditional",
                condition: {
                    values: ["active"],
                    negated: false,
                    suggestion: null,
                },
                items: [],
            },
        },
        {
            trigger: phrase("Trigger", "active", { active: value("active") }),
        },
    );

    const resolved = resolveDocument(model, createDocumentState());

    assert.deepEqual(resolved.groups.conditional, {
        conditionMet: true,
        included: false,
        suggested: true,
    });
});

test("repeatable group presence aggregates its instances", () => {
    const model = definitions(
        {
            repeated: {
                title: "Repeated",
                repeatable: { initial: 0, add: "Add" },
                items: [{ type: "phrase", id: "finding" }],
            },
        },
        {
            finding: phrase("Finding", "present", {
                present: value("present"),
            }),
        },
    );
    const state = createDocumentState();
    state.groupInstances.repeated = ["instance-1"];
    state.instanceStates["instance-1"] = createScopeState();

    const resolved = resolveDocument(model, state);

    assert.equal(resolved.phrases["instance-1:finding"].effectiveIncluded, true);
    assert.equal(resolved.groups["instance-1:repeated"].included, true);
    assert.equal(resolved.groups.repeated.included, true);
});

test("conditional group presence stays scoped to a repeatable instance", () => {
    const model = definitions(
        {
            repeated: {
                title: "Repeated",
                repeatable: { initial: 0, add: "Add" },
                items: [
                    { type: "phrase", id: "trigger" },
                    { type: "group", id: "details" },
                ],
            },
            details: {
                title: "Details",
                condition: {
                    values: ["active"],
                    negated: false,
                    suggestion: null,
                },
                items: [],
            },
        },
        {
            trigger: phrase("Trigger", null, { active: value("active") }),
        },
    );
    const state = createDocumentState();
    state.groupInstances.repeated = ["instance-1", "instance-2"];
    state.instanceStates["instance-1"] = createScopeState();
    state.instanceStates["instance-1"].phraseOverrides.trigger = {
        valueId: "active",
        included: true,
    };
    state.instanceStates["instance-2"] = createScopeState();

    const resolved = resolveDocument(model, state);

    assert.equal(resolved.groups["instance-1:details"].conditionMet, true);
    assert.equal(resolved.groups["instance-1:details"].suggested, true);
    assert.equal(resolved.groups["instance-2:details"].conditionMet, false);
    assert.equal("details" in resolved.groups, false);
    assert.equal(resolved.groups.repeated.suggested, true);
});

test("compiled groups use only the ordered items representation", async () => {
    const packageDefinition = JSON.parse(
        await readFile(new URL("../app/data/ankunft.json", import.meta.url), "utf8"),
    );
    for (const group of Object.values(packageDefinition.groups)) {
        assert.ok(Array.isArray(group.items));
        assert.equal("children" in group, false);
        assert.equal("phrases" in group, false);
    }
});
