export const normaliseSearch = (value) => value
    .toLocaleLowerCase("de-DE")
    .replaceAll("ß", "ss")
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const searchTokens = (query) => {
    const normalised = normaliseSearch(query);
    return normalised === "" ? [] : normalised.split(" ");
};
export const matchesSearchTokens = (searchable, tokens) => tokens.every((token) => searchable.includes(token));
