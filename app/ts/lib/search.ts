export const normaliseSearch = (value: string): string =>
    value
        .toLocaleLowerCase("de-DE")
        .replaceAll("ß", "ss")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

export const searchTokens = (query: string): string[] => {
    const normalised = normaliseSearch(query);
    return normalised === "" ? [] : normalised.split(" ");
};

export const matchesSearchTokens = (
    searchable: string,
    tokens: string[],
): boolean => tokens.every((token) => searchable.includes(token));
