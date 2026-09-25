import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
    createDocumentState,
    createScopeState,
    groupCompactDefault,
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
        applicable: true,
        enabled: true,
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
    assert.equal(resolved.phrases.finding.visible, false);
    assert.equal(resolved.phrases.finding.effectiveIncluded, false);
    assert.equal(resolved.groups.inactive.included, false);
    assert.equal(resolved.groups.inactive.suggested, false);
    assert.equal(resolved.groups.root.included, false);
});

test("an inactive group gates suggestions until it is reactivated", () => {
    const model = definitions(
        {
            root: {
                title: "Root",
                items: [
                    { type: "phrase", id: "trigger" },
                    { type: "group", id: "inactive" },
                ],
            },
            inactive: {
                title: "Inactive",
                default: false,
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

    let resolved = resolveDocument(model, state);
    assert.equal(resolved.phrases.suggested.visible, false);
    assert.equal(resolved.groups.inactive.suggested, false);

    state.groupOverrides.inactive = true;
    resolved = resolveDocument(model, state);
    assert.equal(resolved.phrases.suggested.visible, true);
    assert.equal(resolved.groups.inactive.suggested, true);
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
        applicable: true,
        enabled: true,
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

test("an empty-state phrase remains until a repeatable instance is completed", () => {
    const model = definitions(
        {
            root: {
                title: "Root",
                items: [
                    { type: "phrase", id: "empty" },
                    { type: "group", id: "repeated" },
                ],
            },
            repeated: {
                title: "Repeated",
                repeatable: { initial: 0, add: "Add", empty: "empty" },
                items: [{ type: "phrase", id: "finding" }],
            },
        },
        {
            empty: phrase("Empty", "none", { none: value("none") }),
            finding: phrase("Finding", null, { present: value("present") }),
        },
    );
    const state = createDocumentState();
    state.groupInstances.repeated = ["instance-1"];
    state.instanceStates["instance-1"] = createScopeState();

    let resolved = resolveDocument(model, state);
    assert.equal(resolved.phrases.empty.effectiveIncluded, true);
    assert.equal(resolved.phrases.empty.visible, true);

    state.instanceStates["instance-1"].phraseOverrides.finding = {
        valueId: "present",
        included: true,
    };
    resolved = resolveDocument(model, state);
    assert.equal(resolved.phrases.empty.effectiveIncluded, false);
    assert.equal(resolved.phrases.empty.visible, false);

    state.instanceStates["instance-1"].phraseOverrides.finding = {
        valueId: "present",
        included: false,
    };
    resolved = resolveDocument(model, state);
    assert.equal(resolved.phrases.empty.effectiveIncluded, true);
    assert.equal(resolved.phrases.empty.visible, true);
});

test("active lenses provide a group default without overriding user choice", () => {
    const model = definitions(
        {
            root: {
                title: "Root",
                activeLenses: ["special"],
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

    let resolved = resolveDocument(model, state, "general");
    assert.equal(resolved.groups.root.enabled, false);
    assert.equal(resolved.phrases.finding.effectiveIncluded, false);

    resolved = resolveDocument(model, state, "special");
    assert.equal(resolved.groups.root.enabled, true);
    assert.equal(resolved.phrases.finding.effectiveIncluded, true);

    state.groupOverrides.root = false;
    resolved = resolveDocument(model, state, "special");
    assert.equal(resolved.groups.root.enabled, false);

    state.groupOverrides.root = true;
    resolved = resolveDocument(model, state, "general");
    assert.equal(resolved.groups.root.enabled, true);
});

test("group lenses hide inapplicable branches without discarding their state", () => {
    const model = definitions(
        {
            root: {
                title: "Root",
                items: [
                    { type: "group", id: "preclinical" },
                    { type: "group", id: "clinical" },
                ],
            },
            preclinical: {
                title: "Status",
                lenses: ["preclinical"],
                items: [{ type: "phrase", id: "preclinical-finding" }],
            },
            clinical: {
                title: "Status",
                lenses: ["clinical"],
                items: [{ type: "phrase", id: "clinical-finding" }],
            },
        },
        {
            "preclinical-finding": phrase("Preclinical", "present", {
                present: value("present"),
            }),
            "clinical-finding": phrase("Clinical", "present", {
                present: value("present"),
            }),
        },
    );
    const state = createDocumentState();
    state.groupOverrides.clinical = true;

    let resolved = resolveDocument(model, state, "preclinical");
    assert.equal(resolved.groups.preclinical.applicable, true);
    assert.equal(resolved.groups.preclinical.enabled, true);
    assert.equal(resolved.groups.clinical.applicable, false);
    assert.equal(resolved.groups.clinical.enabled, false);
    assert.equal(resolved.phrases["preclinical-finding"].effectiveIncluded, true);
    assert.equal(resolved.phrases["clinical-finding"].included, true);
    assert.equal(resolved.phrases["clinical-finding"].visible, false);
    assert.equal(resolved.phrases["clinical-finding"].effectiveIncluded, false);

    resolved = resolveDocument(model, state, "clinical");
    assert.equal(resolved.groups.preclinical.applicable, false);
    assert.equal(resolved.groups.clinical.applicable, true);
    assert.equal(resolved.groups.clinical.enabled, true);
    assert.equal(resolved.phrases["preclinical-finding"].effectiveIncluded, false);
    assert.equal(resolved.phrases["clinical-finding"].effectiveIncluded, true);
});

test("inactive groups start compact without coupling compactness to activity", () => {
    assert.equal(groupCompactDefault(false, false, false), true);
    assert.equal(groupCompactDefault(true, false, false), false);
    assert.equal(groupCompactDefault(true, true, false), true);
    assert.equal(groupCompactDefault(true, false, true), true);
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
