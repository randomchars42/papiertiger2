import * as config from "@lib/config.js";

declare module "@lib/config.js" {
    interface ConfigSchema {
        dataURL: string;
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
        autoCollapseSeconds: 0,
        symptomLens: "rettungsdienst",
        languageURL: "./language",
        pluginURL: "./plugins",
    });

    config.configure("production", {
        language: "de_DE",
        logLevel: "error",
        baseURL: "./",
        dataURL: "./data/",
        autoCollapseSeconds: 0,
        symptomLens: "rettungsdienst",
        languageURL: "./language",
        pluginURL: "./plugins",
    });
};
