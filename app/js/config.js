import * as config from "@lib/config.js";
export const configure = () => {
    config.configure("test", {
        language: "de_AT",
        logLevel: "debug",
        baseURL: "./",
        dataURL: "./data",
        languageURL: "./language",
        pluginURL: "./plugins",
    });
    config.configure("production", {
        language: "de_DE",
        logLevel: "error",
        baseURL: "./",
        dataURL: "./data/",
        languageURL: "./language",
        pluginURL: "./plugins",
    });
};
