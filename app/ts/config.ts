import * as config from "@lib/config.js";

declare module "@lib/config.js" {
    interface ConfigSchema {
        dataURL: string;
        autoCompactSeconds: number;
        /** @deprecated URL compatibility for existing bookmarks. */
        autoCollapseSeconds: number;
        symptomLens: string;
    }
}

export const configure = (): void => {
    config.configure("test", {
        language: "de_AT",
        logLevel: "debug",
        baseURL: "./",
        dataURL: "./data",
        autoCompactSeconds: 12,
        autoCollapseSeconds: 12,
        symptomLens: "rettungsdienst",
        languageURL: "./language",
        pluginURL: "./plugins",
    });

    config.configure("production", {
        language: "de_DE",
        logLevel: "error",
        baseURL: "./",
        dataURL: "./data/",
        autoCompactSeconds: 12,
        autoCollapseSeconds: 12,
        symptomLens: "rettungsdienst",
        languageURL: "./language",
        pluginURL: "./plugins",
    });
};
