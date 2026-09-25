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
