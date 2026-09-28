import assert from "node:assert/strict";
import test from "node:test";

import {
    matchesSearchTokens,
    normaliseSearch,
    searchTokens,
} from "../app/js/lib/search.js";

test("German umlauts use the compiler's ae/oe/ue search spelling", () => {
    assert.equal(normaliseSearch("Hüftschmerz"), "hueftschmerz");
    assert.equal(normaliseSearch("größer äußerlich"), "groesser aeusserlich");
});

test("a German user query matches the compiled catalog search text", () => {
    assert.equal(
        matchesSearchTokens(
            "hueftschmerz schmerzen an der huefte",
            searchTokens("Hüftschmerz"),
        ),
        true,
    );
});
