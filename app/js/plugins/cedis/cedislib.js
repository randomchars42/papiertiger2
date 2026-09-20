export const normalise = (value) => value
    .toLocaleLowerCase("de-DE")
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const isStringArray = (value) => Array.isArray(value) &&
    value.every((item) => typeof item === "string");
const isCategory = (value) => {
    if (typeof value !== "object" || value === null)
        return false;
    const category = value;
    return (typeof category.code === "string" &&
        typeof category.label === "string" &&
        isStringArray(category.tags));
};
const isEntry = (value) => {
    if (typeof value !== "object" || value === null)
        return false;
    const entry = value;
    return (typeof entry.code === "string" &&
        /^\d{3}$/.test(entry.code) &&
        typeof entry.category === "string" &&
        typeof entry.label === "string" &&
        typeof entry.english === "string" &&
        isStringArray(entry.tags));
};
const isSource = (value) => {
    if (typeof value !== "object" || value === null)
        return false;
    const source = value;
    return typeof source.label === "string" && typeof source.url === "string";
};
export const validateCatalog = (value) => {
    if (typeof value !== "object" || value === null) {
        throw new Error("CEDIS data is not an object");
    }
    const catalog = value;
    if (typeof catalog.system !== "string" ||
        typeof catalog.version !== "string" ||
        typeof catalog.language !== "string" ||
        typeof catalog.originalDate !== "string" ||
        typeof catalog.translationDate !== "string" ||
        typeof catalog.license !== "string" ||
        !Array.isArray(catalog.sources) ||
        !catalog.sources.every(isSource) ||
        !Array.isArray(catalog.categories) ||
        !catalog.categories.every(isCategory) ||
        !Array.isArray(catalog.entries) ||
        !catalog.entries.every(isEntry)) {
        throw new Error("CEDIS data has an invalid format");
    }
    const categoryCodes = new Set(catalog.categories.map((category) => category.code));
    const entryCodes = catalog.entries.map((entry) => entry.code);
    if (new Set(entryCodes).size !== entryCodes.length ||
        catalog.entries.some((entry) => !categoryCodes.has(entry.category))) {
        throw new Error("CEDIS data contains duplicate or orphaned codes");
    }
    return catalog;
};
export const createIndex = (catalog) => {
    const categories = new Map(catalog.categories.map((category) => [
        category.code,
        category,
    ]));
    const documents = catalog.entries.map((entry) => {
        const category = categories.get(entry.category);
        if (category === undefined) {
            throw new Error(`Unknown CEDIS category "${entry.category}"`);
        }
        return {
            entry,
            code: normalise(entry.code),
            label: normalise(entry.label),
            english: normalise(entry.english),
            tags: entry.tags.map(normalise),
            categoryLabel: normalise(category.label),
            categoryTags: category.tags.map(normalise),
        };
    });
    return { catalog, documents };
};
const bestTextScore = (query, texts, exact, startsWith, includes) => {
    let best = 0;
    for (const text of texts) {
        if (text === query)
            best = Math.max(best, exact);
        else if (text.startsWith(query))
            best = Math.max(best, startsWith);
        else if (text.includes(query))
            best = Math.max(best, includes);
    }
    return best;
};
const scoreDocument = (document, rawQuery) => {
    const query = normalise(rawQuery);
    if (query === "")
        return null;
    const numeric = /^\d{1,3}$/.test(query);
    const codeQuery = numeric ? query.padStart(3, "0") : query;
    const tokens = query.split(" ");
    const searchable = [
        document.code,
        document.label,
        document.english,
        ...document.tags,
        document.categoryLabel,
        ...document.categoryTags,
    ];
    if (numeric && document.code !== codeQuery)
        return null;
    if (!numeric &&
        !tokens.every((token) => searchable.some((text) => text.includes(token)))) {
        return null;
    }
    let score = 0;
    score += bestTextScore(codeQuery, [document.code], 180, 130, 80);
    score += bestTextScore(query, [document.label], 150, 110, 85);
    score += bestTextScore(query, document.tags, 125, 95, 70);
    score += bestTextScore(query, [document.english], 80, 60, 45);
    score += bestTextScore(query, [document.categoryLabel], 55, 42, 30);
    score += bestTextScore(query, document.categoryTags, 40, 30, 20);
    for (const token of tokens) {
        score += bestTextScore(token, [document.label], 32, 24, 18);
        score += bestTextScore(token, document.tags, 28, 21, 15);
        score += bestTextScore(token, [document.english], 16, 12, 9);
        score += bestTextScore(token, document.categoryTags, 8, 6, 4);
    }
    const matchedTags = document.entry.tags.filter((tag) => {
        const normalisedTag = normalise(tag);
        return tokens.some((token) => normalisedTag.includes(token) || token.includes(normalisedTag));
    });
    return { entry: document.entry, score, matchedTags };
};
export const searchCatalog = (index, query) => index.documents
    .map((document) => scoreDocument(document, query))
    .filter((result) => result !== null)
    .sort((left, right) => right.score - left.score ||
    left.entry.code.localeCompare(right.entry.code));
export const relatedTags = (index, results, query) => {
    if (normalise(query) === "") {
        return index.catalog.categories.map((category) => category.label);
    }
    const queryTokens = normalise(query).split(" ");
    const frequencies = new Map();
    for (const result of results.slice(0, 20)) {
        for (const tag of result.entry.tags) {
            const key = normalise(tag);
            if (key === "" ||
                queryTokens.some((token) => key.includes(token) || token.includes(key))) {
                continue;
            }
            const existing = frequencies.get(key);
            frequencies.set(key, {
                label: tag,
                count: (existing?.count ?? 0) + 1,
            });
        }
    }
    return [...frequencies.values()]
        .sort((left, right) => right.count - left.count ||
        left.label.localeCompare(right.label, "de"))
        .slice(0, 12)
        .map(({ label }) => label);
};
