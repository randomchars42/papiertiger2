import * as config from "@lib/config.js";
export const configure = () => {
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
