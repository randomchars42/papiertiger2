export type CedisCategory = {
    code: string;
    label: string;
    tags: string[];
};

export type CedisEntry = {
    code: string;
    category: string;
    label: string;
    english: string;
    tags: string[];
};

export type CedisSource = {
    label: string;
    url: string;
};

export type CedisCatalog = {
    system: string;
    version: string;
    language: string;
    originalDate: string;
    translationDate: string;
    license: string;
    sources: CedisSource[];
    categories: CedisCategory[];
    entries: CedisEntry[];
};

export type CedisSelection = {
    system: string;
    version: string;
    code: string;
    display: string;
    category: string;
};

export type CedisSuggestion = {
    code: string;
    sources: string[];
    relations: string[];
};

export type CedisStructuredValue = {
    system: string;
    version: string;
    selections: CedisSelection[];
};

export type CedisState = {
    selectedCodes: string[];
    suggestions: CedisSuggestion[];
};
