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

export type CedisSearchResult = {
    entry: CedisEntry;
    score: number;
    matchedTags: string[];
};

export type CedisSelection = {
    system: string;
    version: string;
    code: string;
    display: string;
    category: string;
};

export type CedisState = {
    query: string;
    selectedCode: string | null;
};

export type CedisSearchDocument = {
    entry: CedisEntry;
    code: string;
    label: string;
    english: string;
    tags: string[];
    categoryLabel: string;
    categoryTags: string[];
};

export type CedisIndex = {
    catalog: CedisCatalog;
    documents: CedisSearchDocument[];
};
